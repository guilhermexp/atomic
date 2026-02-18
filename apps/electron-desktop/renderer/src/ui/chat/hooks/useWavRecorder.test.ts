// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWavRecorder } from "./useWavRecorder";

function createMockProcessor() {
  return {
    onaudioprocess: null as
      | ((e: { inputBuffer: { getChannelData: (ch: number) => Float32Array } }) => void)
      | null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockSource() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function createMockCtx(
  processor: ReturnType<typeof createMockProcessor>,
  source: ReturnType<typeof createMockSource>
) {
  return {
    createMediaStreamSource: vi.fn(() => source),
    createScriptProcessor: vi.fn(() => processor),
    destination: {},
    close: vi.fn(() => Promise.resolve()),
  };
}

function createMockStream() {
  const track = { stop: vi.fn() };
  return { getTracks: vi.fn(() => [track]), track };
}

/** Flush all pending microtasks and timers within act. */
async function flush() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

describe("useWavRecorder", () => {
  let processor: ReturnType<typeof createMockProcessor>;
  let source: ReturnType<typeof createMockSource>;
  let mockStream: ReturnType<typeof createMockStream>;

  beforeEach(() => {
    processor = createMockProcessor();
    source = createMockSource();
    mockStream = createMockStream();

    const ctx = createMockCtx(processor, source);

    // Mock AudioContext as a constructor function (wrapped in vi.fn for spy assertions)
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContext() {
        return ctx;
      })
    );

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn(() => Promise.resolve(mockStream)) },
      writable: true,
      configurable: true,
    });
  });

  it("starts with isRecording=false and no error", () => {
    const { result } = renderHook(() => useWavRecorder());
    expect(result.current.isRecording).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets isRecording=true after startRecording", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    expect(result.current.isRecording).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("creates AudioContext with 16kHz sample rate", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    expect(AudioContext).toHaveBeenCalledWith({ sampleRate: 16_000 });
  });

  it("stopRecording returns null when not recording", async () => {
    const { result } = renderHook(() => useWavRecorder());

    let wav: Uint8Array | null = null;
    await act(async () => {
      wav = await result.current.stopRecording();
    });

    expect(wav).toBeNull();
  });

  it("stopRecording returns WAV with correct header when audio was recorded", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    // Push audio through the ScriptProcessorNode
    const fakeSamples = new Float32Array([0.5, -0.5, 0.25, -0.25]);
    act(() => {
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => fakeSamples } });
    });

    let wav: Uint8Array | null = null;
    await act(async () => {
      wav = await result.current.stopRecording();
    });

    expect(wav).not.toBeNull();
    expect(wav!.length).toBeGreaterThan(44);

    // RIFF header
    const riff = String.fromCharCode(wav![0]!, wav![1]!, wav![2]!, wav![3]!);
    expect(riff).toBe("RIFF");

    // WAVE format marker
    const wave = String.fromCharCode(wav![8]!, wav![9]!, wav![10]!, wav![11]!);
    expect(wave).toBe("WAVE");

    // data sub-chunk
    const data = String.fromCharCode(wav![36]!, wav![37]!, wav![38]!, wav![39]!);
    expect(data).toBe("data");

    expect(result.current.isRecording).toBe(false);
  });

  it("stopRecording returns null when no audio chunks were collected", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    let wav: Uint8Array | null = null;
    await act(async () => {
      wav = await result.current.stopRecording();
    });

    expect(wav).toBeNull();
  });

  it("cancelRecording stops recording and cleans up", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    expect(result.current.isRecording).toBe(true);

    act(() => {
      result.current.cancelRecording();
    });

    expect(result.current.isRecording).toBe(false);
    expect(mockStream.track.stop).toHaveBeenCalled();
  });

  it("sets error when getUserMedia is denied", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(
      new Error("Permission denied")
    );

    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    expect(result.current.error).toContain("Microphone access denied");
    expect(result.current.isRecording).toBe(false);
  });

  it("WAV output has correct data length for given samples", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    const samples = new Float32Array(100);
    for (let i = 0; i < 100; i++) samples[i] = Math.sin(i * 0.1);

    act(() => {
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => samples } });
    });

    let wav: Uint8Array | null = null;
    await act(async () => {
      wav = await result.current.stopRecording();
    });

    // 100 samples * 2 bytes/sample (16-bit) + 44-byte header = 244
    expect(wav).not.toBeNull();
    expect(wav!.length).toBe(244);
  });

  it("multiple audio chunks are merged correctly", async () => {
    const { result } = renderHook(() => useWavRecorder());

    act(() => {
      result.current.startRecording();
    });
    await flush();

    // Push two chunks of 50 samples each
    const chunk1 = new Float32Array(50).fill(0.1);
    const chunk2 = new Float32Array(50).fill(-0.1);

    act(() => {
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => chunk1 } });
      processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => chunk2 } });
    });

    let wav: Uint8Array | null = null;
    await act(async () => {
      wav = await result.current.stopRecording();
    });

    // 100 total samples * 2 bytes + 44-byte header
    expect(wav).not.toBeNull();
    expect(wav!.length).toBe(244);
  });
});
