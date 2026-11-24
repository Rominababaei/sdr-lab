#!/usr/bin/env python3
"""Analyze a real headerless little-endian complex64 SDR capture.

No radio connection is required. No measurements are fabricated: outputs are
computed only from the supplied file. Relative PSD is not calibrated dBm.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def db(value):
    return 10 * np.log10(np.maximum(value, np.finfo(float).tiny))


def crossing(freq, profile_db, peak_index, level_db, direction):
    """Nearest threshold crossing of the connected main lobe; interpolate in dB."""
    i = peak_index
    while 0 <= i + direction < len(freq):
        j = i + direction
        if profile_db[j] <= level_db:
            denom = profile_db[j] - profile_db[i]
            alpha = (level_db - profile_db[i]) / denom if denom else 0.0
            return float(freq[i] + alpha * (freq[j] - freq[i]))
        i = j
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", type=Path, required=True)
    ap.add_argument("--fs", type=float, required=True, help="Complex sample rate, samples/s")
    ap.add_argument("--fc", type=float, required=True, help="RF label of baseband zero, Hz")
    ap.add_argument("--channel", type=float, required=True, help="RF center of signal to analyze, Hz")
    ap.add_argument("--width", type=float, default=500000, help="Displayed/analyzed span, Hz; includes noise guards")
    ap.add_argument("--obw-width", type=float, default=200000, help="Integration/gating span centered on --channel, Hz")
    ap.add_argument("--nfft", type=int, default=16384)
    ap.add_argument("--bursty", action="store_true", help="Select frames by relative channel-energy threshold")
    ap.add_argument("--threshold-db", type=float, default=6.0)
    ap.add_argument("--x-db", type=float, default=None, help="Override automatic x=20 dB if peak/floor >=26, else 6")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    if not (args.fs > 0 and args.width > args.obw_width > 0 and args.nfft >= 32):
        ap.error("Require fs>0, width>obw-width>0, and nfft>=32.")
    if args.width > args.fs or abs(args.channel-args.fc) + args.width/2 > args.fs/2:
        ap.error("Selected span must lie inside the capture's nominal RF span.")
    if args.x_db is not None and args.x_db <= 0:
        ap.error("--x-db must be positive.")
    size = args.raw.stat().st_size
    if size % 8 or size < args.nfft * 8:
        ap.error("Input must contain a whole number of 8-byte complex64 samples and at least nfft samples.")
    raw = np.memmap(args.raw, dtype="<c8", mode="r")
    n = len(raw)
    hop = args.nfft // 2
    starts = np.arange(0, n-args.nfft+1, hop, dtype=np.int64)
    # Add a final complete frame so that the end is covered; its hop may differ.
    if starts[-1] != n-args.nfft:
        starts = np.r_[starts, n-args.nfft]
    all_freq = args.fc + np.fft.fftshift(np.fft.fftfreq(args.nfft, 1/args.fs))
    selected = np.flatnonzero(np.abs(all_freq-args.channel) <= args.width/2)
    freq = all_freq[selected]
    core = np.abs(freq-args.channel) <= args.obw_width/2
    guard = np.abs(freq-args.channel) >= 0.6*args.obw_width
    if core.sum() < 4 or guard.sum() < 8:
        ap.error("Need at least four signal bins and eight guard bins; increase nfft or span.")
    win = np.hanning(args.nfft)
    norm = args.fs*np.sum(win*win)
    spectra = np.empty((len(starts), len(selected)), dtype=np.float32)
    for i, start in enumerate(starts):
        frame = np.asarray(raw[start:start+args.nfft])
        if not np.isfinite(frame).all():
            raise ValueError(f"Non-finite input at frame {i}.")
        fft = np.fft.fftshift(np.fft.fft(frame*win))
        spectra[i] = (np.abs(fft[selected])**2/norm).astype(np.float32)
    df = args.fs/args.nfft
    energy = np.sum(spectra[:, core], axis=1, dtype=np.float64)*df
    baseline = float(np.percentile(energy, 10))
    gate_threshold = baseline*10**(args.threshold_db/10)
    active = energy > gate_threshold if args.bursty else np.ones(len(starts), dtype=bool)
    if not active.any():
        raise ValueError("No frames exceed the gate; inspect channel, gain and threshold.")
    chosen = spectra[active]
    mean_psd = np.mean(chosen, axis=0, dtype=np.float64)
    max_psd = np.max(chosen, axis=0)
    noise_mean = float(np.median(mean_psd[guard]))
    noise_max = float(np.median(max_psd[guard]))
    core_indices = np.flatnonzero(core)
    k_peak = int(core_indices[np.argmax(max_psd[core])])
    peak_db = float(db(max_psd[k_peak]))
    snr_db = peak_db-float(db(noise_max))
    x_db = float(args.x_db if args.x_db is not None else (20 if snr_db >= 26 else 6))
    level_db = peak_db-x_db
    profile = db(max_psd)
    f_l = crossing(freq, profile, k_peak, level_db, -1)
    f_u = crossing(freq, profile, k_peak, level_db, 1)
    width_x = f_u-f_l if f_l is not None and f_u is not None else None
    fc_x = (f_l+f_u)/2 if width_x is not None else None
    signal_power = np.maximum(mean_psd[core]-noise_mean, 0)*df
    total_power = float(np.sum(signal_power))
    core_freq = freq[core]
    if total_power <= 0:
        raise ValueError("No positive signal power remains after noise subtraction.")
    # Treat each FFT bin's power as uniform within that bin for quantile edges.
    bin_edges = np.r_[core_freq-df/2, core_freq[-1]+df/2]
    cdf_edges = np.r_[0, np.cumsum(signal_power)/total_power]
    low_obw, high_obw = np.interp([0.005, 0.995], cdf_edges, bin_edges)
    times = (starts+args.nfft/2)/args.fs
    intervals = []
    if args.bursty:
        padded = np.r_[False, active, False]
        begin = np.flatnonzero(np.diff(padded.astype(int)) == 1)
        end = np.flatnonzero(np.diff(padded.astype(int)) == -1)-1
        for b, e in zip(begin, end):
            t0, t1 = float(starts[b]/args.fs), float((starts[e]+args.nfft)/args.fs)
            intervals.append(dict(start_s=t0, end_s=t1, duration_s=t1-t0))
    warnings = [
        "PSD uses uncalibrated input units squared per Hz; it is not dBm.",
        "File duration is sample duration, not proof of gap-free network acquisition.",
        "Inspect noise guards for other signals; a flat scalar floor is an approximation.",
        "x-dB edges describe the connected lobe around the strongest in-channel peak; inspect the plot.",
        "Max Hold from every file frame differs from sparse live GUI Max Hold.",
    ]
    if args.bursty:
        warnings += [
            "Gate baseline is the 10th percentile of channel energy; high duty cycle may invalidate it.",
            "Detected active-frame groups are not a count of remote-button presses or transmissions.",
            "Event boundaries are broadened by window support; timing uncertainty is at least one FFT frame.",
        ]
    if f_l is None or f_u is None:
        warnings.append("At least one x-dB crossing lies outside the selected view; bandwidth is null.")
    result = dict(
        input_file=args.raw.name, byte_count=size, samples=n,
        sample_duration_s=n/args.fs, sample_rate_sps=args.fs, rf_zero_hz=args.fc,
        channel_hz=args.channel, view_width_hz=args.width, integration_width_hz=args.obw_width,
        fft_length=args.nfft, fft_bin_hz=df, window="Hann", hop_samples=hop,
        total_fft_frames=len(starts), selected_fft_frames=int(active.sum()),
        frame_duration_s=args.nfft/args.fs,
        gate_enabled=args.bursty, gate_threshold_db_above_baseline=args.threshold_db,
        peak_frequency_hz=float(freq[k_peak]), peak_relative_psd_db_per_hz=peak_db,
        maxhold_guard_floor_db_per_hz=float(db(noise_max)), peak_to_guard_db=snr_db,
        x_db=x_db, threshold_db_per_hz=level_db, f_L_hz=f_l, f_U_hz=f_u,
        bandwidth_x_hz=width_x, center_x_hz=fc_x,
        occupied_99_low_hz=float(low_obw), occupied_99_high_hz=float(high_obw),
        occupied_99_bandwidth_hz=float(high_obw-low_obw),
        mean_signal_centroid_hz=float(np.dot(core_freq, signal_power)/total_power),
        active_frame_group_count=len(intervals) if args.bursty else None, warnings=warnings,
    )
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out/"metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    with (args.out/"spectrum.csv").open("w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["frequency_hz", "mean_psd_linear", "maxhold_psd_linear", "noise_floor_linear"])
        writer.writerows(zip(freq, mean_psd, max_psd, np.full(len(freq), noise_mean)))
    with (args.out/"active-frame-groups.csv").open("w", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=["start_s", "end_s", "duration_s"])
        writer.writeheader(); writer.writerows(intervals)
    fig, ax = plt.subplots(figsize=(10, 4.8), constrained_layout=True)
    ax.plot(freq/1e6, db(mean_psd), lw=1, label="Linear-mean Welch PSD")
    ax.plot(freq/1e6, profile, lw=0.9, alpha=0.8, label="All-selected-frame Max Hold")
    ax.axhline(level_db, ls="--", color="tab:red", label=f"Peak - {x_db:g} dB")
    ax.axvspan(low_obw/1e6, high_obw/1e6, color="tab:green", alpha=0.12, label="99% occupied band (mean)")
    for edge in (f_l, f_u):
        if edge is not None: ax.axvline(edge/1e6, color="tab:red", ls=":")
    ax.set(xlabel="RF frequency (MHz)", ylabel="Relative PSD (dB / Hz)", title=f"Measured capture: {args.raw.name}")
    ax.grid(alpha=0.2); ax.legend(fontsize=8)
    fig.savefig(args.out/"spectrum.png", dpi=180)
    fig.savefig(args.out/"spectrum.pdf"); plt.close(fig)
    fig, (ax, energy_ax) = plt.subplots(2, 1, figsize=(10, 6.5), constrained_layout=True, gridspec_kw={"height_ratios":[2,1]})
    mesh = ax.pcolormesh(freq/1e6, times, db(spectra), shading="nearest", cmap="viridis")
    ax.set(xlabel="RF frequency (MHz)", ylabel="Sample time (s)", title="All-sample offline waterfall; no sparse GUI updates")
    fig.colorbar(mesh, ax=ax, label="Relative PSD (dB / Hz)")
    energy_ax.plot(times, db(energy), lw=0.8)
    if args.bursty: energy_ax.axhline(float(db(gate_threshold)), color="tab:red", ls="--", label="Gate threshold")
    energy_ax.set(xlabel="Sample time (s)", ylabel="Relative band power (dB)")
    energy_ax.grid(alpha=0.2)
    fig.savefig(args.out/"waterfall.png", dpi=180)
    fig.savefig(args.out/"waterfall.pdf"); plt.close(fig)
    print(json.dumps({"output": str(args.out), "frames": len(starts), "selected": int(active.sum()), "bandwidth_x_hz": width_x, "occupied_99_hz": float(high_obw-low_obw)}, indent=2))


if __name__ == "__main__":
    main()
