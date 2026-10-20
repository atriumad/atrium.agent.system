export type CardScanner = {
  supported(): boolean;
  /** Starts the camera in `video`; calls `onCode` with each QR it reads. Resolves to the stop function. */
  start(video: HTMLVideoElement, onCode: (raw: string) => void): Promise<() => void>;
};

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;

const detectorCtor = (): DetectorCtor | undefined =>
  (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

/** The browser's own camera and BarcodeDetector. Nothing is uploaded; the video stays on the device. */
export const barcodeScanner: CardScanner = {
  supported: () =>
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    detectorCtor() !== undefined,
  async start(video, onCode) {
    const Ctor = detectorCtor();
    if (!Ctor) throw new Error("unsupported");
    const detector = new Ctor({ formats: ["qr_code"] });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    let stopped = false;
    let busy = false;
    const stop = () => {
      stopped = true;
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    };
    video.srcObject = stream;
    await video.play?.().catch(() => undefined);
    const timer = setInterval(() => {
      if (stopped || busy) return;
      busy = true;
      detector
        .detect(video)
        .then((codes) => {
          const hit = codes[0];
          if (!stopped && hit) onCode(hit.rawValue);
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, 250);
    return stop;
  },
};
