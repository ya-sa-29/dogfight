
import math
import os
import random
import wave
import struct

OUTPUT = "public/assets/audio"
SAMPLE_RATE = 22050

os.makedirs(OUTPUT, exist_ok=True)


def generate_sound(filename, duration, frequency_start, frequency_end, volume):
    samples = int(SAMPLE_RATE * duration)

    with wave.open(os.path.join(OUTPUT, filename), "w") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)

        frames = []

        for i in range(samples):
            t = i / SAMPLE_RATE
            progress = i / samples

            frequency = (
                frequency_start
                + (frequency_end - frequency_start) * progress
            )

            envelope = (1 - progress) ** 2
            signal = math.sin(2 * math.pi * frequency * t)
            value = signal * envelope * volume

            sample = int(max(-1, min(1, value)) * 32767)
            frames.append(struct.pack("<h", sample))

        audio.writeframes(b"".join(frames))


generate_sound("shot.wav", 0.12, 900, 180, 0.7)
generate_sound("missile.wav", 0.35, 180, 65, 0.8)
generate_sound("hit.wav", 0.18, 350, 80, 0.7)
generate_sound("explosion.wav", 0.55, 150, 35, 0.9)

print("Audio files generated successfully.")
