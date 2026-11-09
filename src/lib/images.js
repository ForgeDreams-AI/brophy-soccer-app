// Image downscaling — one implementation replacing the 4 variants in the v1
// app (chat 1600/q0.86, drill 1600/q0.86, avatar 640/q0.85, logo 512/q0.9).
// Resolves { blob, dataUrl } with the image fit inside maxDim (long edge)
// and encoded as JPEG at `quality`.

export function downscaleImage(file, { maxDim = 1600, quality = 0.86 } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Couldn't process that image."));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve({ blob, dataUrl: reader.result });
            reader.onerror = () => reject(new Error("Couldn't read that image."));
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          quality,
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't load that image."));
    };
    img.src = url;
  });
}

// Presets matching the old call sites, for drop-in migration.
export const downscaleChatImage = (file) => downscaleImage(file, { maxDim: 1600, quality: 0.86 });
export const downscaleAvatar = (file) => downscaleImage(file, { maxDim: 640, quality: 0.85 });
export const downscaleLogo = (file) => downscaleImage(file, { maxDim: 512, quality: 0.9 });
