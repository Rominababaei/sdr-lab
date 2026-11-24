"""SDR Lab IQ Recorder: example GNU Radio Embedded Python Block.

Paste this file into GRC's Python Block / Embedded Python Block editor.
Read and adapt the example before submitting your coursework.

States: IDLE -> RECORDING -> WAIT (until Record is cleared).
Files contain headerless complex64 samples, with interleaved float32 I/Q.
The limit is measured in samples, not elapsed computer time.
Only this sink is implemented here; it does not configure or transmit RF.
"""

import math
import os
import threading
import time

import numpy as np
from gnuradio import gr


class blk(gr.sync_block):
    def __init__(self, team="Team-00", lab=1, fc=100e6, fs=2.6e6,
                 gain=0.0, record=False, max_seconds=5.0, folder="."):
        gr.sync_block.__init__(
            self, name="SDR Lab IQ Recorder",
            in_sig=[np.complex64], out_sig=None,
        )
        self._lock = threading.RLock()
        # GRC recognizes the properties named fc, fs, gain and record below
        # and updates them when their GUI variables change.
        self.team = team
        self.lab = lab
        self._fc = float(fc)
        self._fs = float(fs)
        self._gain = float(gain)
        self._record = bool(record)
        self.max_seconds = max_seconds
        self.folder = folder
        self._state = "IDLE"
        self._file = None
        self._saved_settings = None
        self._count = 0
        self._limit = 0

    def _change_setting(self, name, value):
        with self._lock:
            value = float(value)
            if getattr(self, name) != value:
                if self._state == "RECORDING":
                    self._finish("fc / fs / gain changed", "WAIT")
                setattr(self, name, value)

    @property
    def fc(self):
        return self._fc

    @fc.setter
    def fc(self, value):
        self._change_setting("_fc", value)

    @property
    def fs(self):
        return self._fs

    @fs.setter
    def fs(self, value):
        self._change_setting("_fs", value)

    @property
    def gain(self):
        return self._gain

    @gain.setter
    def gain(self, value):
        self._change_setting("_gain", value)

    @property
    def record(self):
        return self._record

    @record.setter
    def record(self, value):
        with self._lock:
            self._record = bool(value)
            if not self._record:
                if self._state == "RECORDING":
                    self._finish("record cleared", "IDLE")
                else:
                    self._state = "IDLE"

    def _begin(self):
        frequency = int(round(self._fc))
        sample_rate = int(round(self._fs))
        duration = float(self.max_seconds)
        if sample_rate <= 0 or not math.isfinite(duration) or duration <= 0:
            raise ValueError("fs and max_seconds must be finite and positive")
        self._limit = math.floor(duration * sample_rate)
        if self._limit < 1:
            raise ValueError("The recording limit must allow at least one sample")

        self._saved_settings = (frequency, sample_rate, self._gain)
        timestamp = time.strftime("%Y%m%dT%H%M%S")
        filename = (f"{self.team}_lab{int(self.lab):02d}_{frequency}_"
                    f"{sample_rate}_{self._gain:.1f}_{timestamp}.cf32")
        directory = os.fspath(self.folder)
        os.makedirs(directory, exist_ok=True)
        # Exclusive creation avoids overwriting data. If identical settings
        # are recorded twice in one second, preserve the required filename
        # inside a numbered subfolder instead of changing its format.
        collision = 0
        while True:
            target_dir = (directory if collision == 0 else
                          os.path.join(directory, f"repeat_{collision:03d}"))
            os.makedirs(target_dir, exist_ok=True)
            path = os.path.join(target_dir, filename)
            try:
                self._file = open(path, "xb")
                break
            except FileExistsError:
                collision += 1
        self._count = 0
        self._state = "RECORDING"
        print(f"[REC] start {path}", flush=True)

    def _finish(self, reason, next_state):
        if self._file is not None:
            self._file.close()
            self._file = None
            sample_rate = self._saved_settings[1]
            print(f"[REC] stop {self._count} samples = "
                  f"{self._count / sample_rate:.6f} s ({reason})", flush=True)
        self._state = next_state

    def work(self, input_items, output_items):
        samples = input_items[0]
        with self._lock:
            if self._state == "IDLE" and self._record and len(samples):
                self._begin()
            if self._state == "RECORDING":
                count = min(len(samples), self._limit - self._count)
                # Write the whole slice at once; no per-sample Python loop.
                np.asarray(samples[:count], dtype=np.complex64).tofile(self._file)
                self._count += count
                if self._count == self._limit:
                    self._finish("max_seconds reached", "WAIT")
        # Always consume the entire input, even when not recording or when
        # only part of the buffer was needed to finish the current file.
        return len(samples)

    def stop(self):
        with self._lock:
            self._finish("flowgraph stopped", "IDLE")
        return True
