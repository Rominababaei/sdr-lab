#!/usr/bin/env python3
"""Analyze an actual GNU Radio little-endian complex-float32 loopback recording.

No radio hardware is needed. Frequencies are nominal labels derived from the
settings supplied on the command line; this is not absolute RF calibration.
Example:
  python analyze_loopback.py --raw recording.cf32 --out results
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from scipy.signal.windows import hann


def estimate_peak(frequency, power, target, radius):
    """Find a local maximum and interpolate log power using its neighbours."""
    indices = np.flatnonzero(np.abs(frequency - target) <= radius)
    if indices.size < 3:
        raise ValueError("The requested search interval is outside the sampled band.")
    k = int(indices[np.argmax(power[indices])])
    offset = 0.0
    if 0 < k < power.size - 1:
        y0, y1, y2 = np.log(np.maximum(power[k - 1:k + 2], np.finfo(float).tiny))
        denominator = y0 - 2 * y1 + y2
        if denominator < 0:
            offset = float(np.clip(0.5 * (y0 - y2) / denominator, -0.5, 0.5))
    step = float(frequency[1] - frequency[0])
    estimate = float(frequency[k] + offset * step)
    return estimate, k


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path("results"))
    parser.add_argument("--fs", type=float, default=2_600_000)
    parser.add_argument("--fc", type=float, default=434_000_000)
    parser.add_argument("--lo-shift", type=float, default=100_000)
    parser.add_argument("--f-tx", type=float, default=250_000)
    parser.add_argument("--nperseg", type=int, default=65_536)
    parser.add_argument("--pad-factor", type=int, default=4)
    parser.add_argument("--max-segments", type=int, default=64)
    parser.add_argument("--skip-seconds", type=float, default=0.1)
    parser.add_argument("--search-hz", type=float, default=20_000)
    args = parser.parse_args()
    if args.fs <= 0 or args.nperseg < 32 or args.pad_factor < 1:
        parser.error("Require fs > 0, nperseg >= 32, and pad-factor >= 1.")
    if args.skip_seconds < 0 or args.max_segments < 1 or args.search_hz <= 0:
        parser.error("Require nonnegative skip and positive segment count/search radius.")
    byte_count = args.raw.stat().st_size
    if byte_count == 0 or byte_count % 8:
        parser.error("A cf32 file must contain a positive whole number of 8-byte samples.")
    samples = np.memmap(args.raw, mode="r", dtype="<c8")
    skip = int(round(args.skip_seconds * args.fs))
    length = min(args.nperseg, samples.size - skip)
    if length < 32:
        parser.error("Too few samples remain after skipping the requested initial duration.")
    if not np.all(np.isfinite(samples)):
        parser.error("The recording contains NaN or infinity; verify the file format.")

    nfft = length * args.pad_factor
    window = hann(length, sym=False)
    normalization = args.fs * np.sum(window ** 2)
    frequencies = np.fft.fftshift(np.fft.fftfreq(nfft, d=1.0 / args.fs))
    lo = args.fc + args.lo_shift
    main_expected = args.fc + args.f_tx
    main_bb = main_expected - lo
    hop = max(length // 2, 1)
    possible = np.arange(skip, samples.size - length + 1, hop)
    if possible.size > args.max_segments:
        selected = np.unique(np.linspace(0, possible.size - 1, args.max_segments).round().astype(int))
        starts = possible[selected]
    else:
        starts = possible
    average = np.zeros(nfft, dtype=float)
    segment_estimates = []
    for start in starts:
        x = np.asarray(samples[start:start + length], dtype=np.complex128)
        spectrum = np.fft.fftshift(np.fft.fft(x * window, n=nfft))
        power = np.abs(spectrum) ** 2 / normalization
        average += power
        f_estimate, _ = estimate_peak(frequencies, power, main_bb, args.search_hz)
        segment_estimates.append((int(start), float(start / args.fs), lo + f_estimate))
    average /= len(starts)
    estimate_bb, main_index = estimate_peak(frequencies, average, main_bb, args.search_hz)
    estimate_rf = lo + estimate_bb
    grid_hz = args.fs / nfft
    exclusion = 5 * args.fs / length
    hypotheses = [
        ("main_tone", main_expected),
        ("receiver_dc_model", lo),
        ("tx_lo_leakage_model", args.fc),
        ("tx_image_model", args.fc - args.f_tx),
        ("rx_image_of_main_model", 2 * lo - main_expected),
    ]
    rows = []
    for name, expected in hypotheses:
        target = expected - lo
        if abs(target) + args.search_hz >= args.fs / 2:
            rows.append(dict(candidate=name, expected_rf_hz=expected, status="outside_search_band"))
            continue
        est_bb, index = estimate_peak(frequencies, average, target, args.search_hz)
        local = (np.abs(frequencies - est_bb) < args.search_hz) & (np.abs(frequencies - est_bb) > exclusion)
        floor = float(np.median(average[local])) if np.any(local) else float("nan")
        contrast = float(10 * np.log10(average[index] / floor)) if floor > 0 else float("nan")
        detected = bool(np.isfinite(contrast) and contrast >= 6)
        rows.append(dict(
            candidate=name, expected_rf_hz=expected,
            status="local_peak_above_floor" if detected else "not_resolved_above_local_floor",
            estimated_rf_hz=lo + est_bb if detected else None,
            error_vs_model_hz=lo + est_bb - expected if detected else None,
            peak_above_local_floor_db=contrast,
        ))
    summary = {
        "input_file": args.raw.name,
        "format": "little-endian complex64; 8 bytes/sample; no header",
        "bytes": byte_count, "decimal_MB": byte_count / 1e6,
        "binary_MiB": byte_count / 2 ** 20, "complex_samples": int(samples.size),
        "nominal_sample_rate_hz": args.fs, "sample_duration_s": samples.size / args.fs,
        "assumed_tx_lo_hz": args.fc, "assumed_rx_lo_hz": lo,
        "assumed_baseband_tx_hz": args.f_tx,
        "nperseg": length, "nfft": nfft, "averaged_segments": len(starts),
        "window": "periodic Hann", "averaging": "linear power, 50 percent overlap where available",
        "record_resolution_scale_hz": args.fs / length,
        "padded_grid_hz": grid_hz,
        "main_tone_expected_rf_label_hz": main_expected,
        "main_tone_estimated_rf_label_hz": estimate_rf,
        "main_tone_error_hz": estimate_rf - main_expected,
        "segment_estimate_scatter_sd_hz": float(np.std([r[2] for r in segment_estimates], ddof=1)) if len(starts) > 1 else None,
        "interpretation": [
            "Verify all command-line settings against the actual recording metadata.",
            "Zero padding makes a finer grid, not a longer observation or narrower physical response.",
            "Interpolation and segment scatter do not establish absolute calibration accuracy.",
            "Candidate names are model hypotheses; classification requires the LO-shift test.",
            "Sample count alone cannot establish gap-free acquisition or wall-clock duration.",
        ],
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "raw_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    with (args.out / "peak_candidates.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["candidate", "expected_rf_hz", "status", "estimated_rf_hz", "error_vs_model_hz", "peak_above_local_floor_db"])
        writer.writeheader()
        writer.writerows(rows)
    with (args.out / "segment_tone_estimates.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["start_sample", "nominal_start_s", "estimated_rf_label_hz"])
        writer.writerows(segment_estimates)

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(2, 1, figsize=(10, 7), constrained_layout=True)
    rf_mhz = (frequencies + lo) / 1e6
    levels = 10 * np.log10(np.maximum(average, np.finfo(float).tiny))
    axes[0].plot(rf_mhz, levels, color="#23596a", linewidth=0.7)
    axes[0].set(title="Loopback: linear-power Welch average", xlabel="Nominal RF frequency (MHz)", ylabel="PSD (dB, sample-unit squared/Hz)")
    zoom = np.abs(frequencies - estimate_bb) <= 2500
    axes[1].plot((frequencies[zoom] - main_bb), levels[zoom], color="#23596a", linewidth=1.2)
    axes[1].axvline(estimate_rf - main_expected, color="#b24c36", linestyle="--", label=f"Estimate: {estimate_rf / 1e6:.9f} MHz")
    axes[1].set(xlabel="Offset from expected tone (Hz)", ylabel="PSD (dB, sample-unit squared/Hz)")
    axes[1].legend()
    for axis in axes:
        axis.grid(alpha=0.25)
    fig.savefig(args.out / "spectrum.png", dpi=180)
    fig.savefig(args.out / "spectrum.pdf")
    plt.close(fig)
    print(json.dumps({k: summary[k] for k in ["bytes", "complex_samples", "sample_duration_s", "main_tone_estimated_rf_label_hz", "main_tone_error_hz", "segment_estimate_scatter_sd_hz"]}, indent=2))


if __name__ == "__main__":
    main()
