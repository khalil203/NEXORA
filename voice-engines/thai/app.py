"""Thai voice cloning with F5-TTS-THAI (VIZINTZOR, CC-BY 4.0), for the Second Brain "My Voice" tool.
Runs on a free CPU Space with no usage limit. API: /predict(ref_audio, ref_text, gen_text, speed) -> audio."""
import os, tempfile
import soundfile as sf
import torch, torchaudio
import gradio as gr

torch.set_num_threads(max(1, os.cpu_count() or 2))

# Newer torchaudio needs the torchcodec package to read files; read WAV/FLAC/OGG with soundfile instead.
_ta_load = torchaudio.load
def _load(path, *args, **kwargs):
    try:
        x, sr = sf.read(path, dtype="float32", always_2d=True)
        return torch.from_numpy(x.T.copy()), sr
    except Exception:
        return _ta_load(path, *args, **kwargs)
torchaudio.load = _load

from f5_tts_th.tts import TTS

tts = TTS(model="v1")   # VIZINTZOR/F5-TTS-THAI model_1000000.pt + Vocos


def predict(ref_audio, ref_text, gen_text, speed=1.0):
    if not ref_audio:
        raise gr.Error("Add a voice sample (2-10 seconds).")
    if not (gen_text or "").strip():
        raise gr.Error("Type the text to speak.")
    wav = tts.infer(ref_audio=ref_audio, ref_text=(ref_text or "").strip(), gen_text=gen_text.strip(),
                    step=32, cfg=2.0, speed=float(speed or 1.0))
    out = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    sf.write(out, wav, 24000)
    return out


demo = gr.Interface(
    fn=predict,
    inputs=[
        gr.Audio(label="Voice sample (2-10 s)", type="filepath"),
        gr.Textbox(label="Reference text: what the sample says (leave empty to detect it)"),
        gr.Textbox(label="Text to generate", lines=4),
        gr.Slider(0.6, 1.4, value=1.0, step=0.05, label="Speed"),
    ],
    outputs=gr.Audio(label="Generated speech", type="filepath"),
    title="My Thai voice",
    description="Thai (and English) voice cloning with the open F5-TTS-THAI model by VIZINTZOR (CC-BY 4.0).",
    api_name="predict",
)

if __name__ == "__main__":
    demo.queue(max_size=20).launch(show_error=True)
