import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contestCredentials } from "./credentials.ts";
import { AgentError } from "./errors.ts";
import type { NarrationCue } from "../shared/agent.ts";

export async function synthesizePolly(cues: NarrationCue[], folder: string) {
  const client = new PollyClient({ region: "us-east-1", credentials: contestCredentials, maxAttempts: 1 });
  const voices = [], usage = [];
  try {
    for (const [index, cue] of cues.entries()) {
      if (!cue.narration || [...cue.narration].length > 3000) throw new AgentError("VOICE_LIMIT", "解说文本超过语音限制。", 422);
      const response = await client.send(new SynthesizeSpeechCommand({
        Engine: "neural", VoiceId: "Zhiyu", LanguageCode: "cmn-CN", TextType: "text",
        Text: cue.narration, OutputFormat: "pcm", SampleRate: "16000",
      }), { abortSignal: AbortSignal.timeout(60_000) });
      if (!response.AudioStream) throw new AgentError("VOICE_FAILED", "Polly 未返回音频。", 502);
      const pcm = Buffer.from(await response.AudioStream.transformToByteArray());
      if (!pcm.length || pcm.length % 2 || pcm.length > 20_000_000) throw new AgentError("VOICE_FAILED", "Polly 音频大小无效。", 502);
      const header = Buffer.alloc(44);
      header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
      header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
      const path = resolve(folder, `voice-${index}.wav`);
      await writeFile(path, Buffer.concat([header, pcm]));
      voices.push({ path, duration: pcm.length / 32000 });
      usage.push({ cue: index, voice: "Zhiyu", engine: "neural", requestCharacters: response.RequestCharacters ?? null, requestId: response.$metadata.requestId });
      await writeFile(resolve(folder, "polly-usage.json"), JSON.stringify(usage, null, 2));
    }
    return voices;
  } finally { client.destroy(); }
}
