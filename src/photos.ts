import { newId } from "./items";
import { getPhoto, putPhoto } from "./store";

const MAX_SIDE = 1600;

/** Shrinks a camera photo to at most 1600 px and re-encodes it as JPEG, so it takes ~300 KB instead of several MB. */
export async function shrink(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la foto."))), "image/jpeg", 0.82),
  );
}

/** Stores the files as photos and returns their ids. */
export async function savePhotos(files: FileList | File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const id = newId("f");
    await putPhoto(id, await shrink(f));
    ids.push(id);
  }
  return ids;
}

const urls = new Map<string, string>();

/** Object URL for a stored photo, cached for the session. */
export async function photoUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit) return hit;
  const blob = await getPhoto(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

/** Fills every <img data-photo="id"> under root with its stored photo. */
export function hydratePhotos(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>("img[data-photo]:not([src])").forEach(async (img) => {
    const url = await photoUrl(img.dataset.photo!);
    if (url) img.src = url;
    else img.closest(".thumb")?.remove();
  });
}
