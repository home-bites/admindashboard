import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage, isFirebaseConfigured } from "./firebaseConfig";

// Compress image on client canvas before uploading
export const compressImage = (file, maxWidth = 1200, quality = 0.85) => {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name || "upload.jpg", {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
};

/**
 * Largest base64 image we will ever put inside a Firestore document.
 *
 * The fallback below exists so a failed Storage upload doesn't lose the
 * admin's work. But a data URL is stored *in the document*, and every client
 * that reads that collection downloads it — the customer app pulls the whole
 * menu on open, so a 400 KB image on each of 50 dishes is a 20 MB sync before
 * a single dish appears. That is the app's "slow loading".
 *
 * 100 KB keeps a small logo or icon working while making it impossible to
 * bury a photograph in the database by accident.
 */
const MAX_INLINE_BYTES = 100 * 1024;

/** Rough decoded size of a data URL, without allocating a copy of it. */
const dataUrlBytes = (dataUrl) =>
  Math.floor((String(dataUrl).split(",")[1] || "").length * 0.75);

export const fileToDataURL = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
};

/**
 * A data URL, but only if it is small enough to belong in a Firestore
 * document. Otherwise it throws, which is the honest outcome — the caller
 * shows the message and nothing is saved.
 */
const inlineWithinCap = async (blob) => {
  const dataUrl = await fileToDataURL(blob);
  if (dataUrlBytes(dataUrl) > MAX_INLINE_BYTES) {
    throw new Error(
      "Image upload failed and the file is too large to store inline. " +
      "Check that Firebase Storage is reachable and that storage.rules " +
      "permits this path, or use an image under 100 KB."
    );
  }
  return dataUrl;
};

export const uploadFile = async (file, path, onProgress = null) => {
  if (!file) return "";

  // If already a URL or Data URL, return directly
  if (typeof file === "string" && (file.startsWith("http://") || file.startsWith("https://") || file.startsWith("data:"))) {
    return file;
  }

  try {
    const compressed = await compressImage(file);

    if (isFirebaseConfigured && storage) {
      const storageRef = ref(storage, path);

      /**
       * Cache for a year, immutable.
       *
       * Firebase Storage sets no Cache-Control unless you ask, and the default
       * behaviour means a browser revalidates — often re-downloads — every
       * image on every page load. A customer opening the menu twice in a day
       * was fetching the same photographs twice, which is most of why the home
       * page felt slow.
       *
       * `immutable` is safe here because uploads are written to a timestamped
       * path: changing a dish's photo produces a new filename and therefore a
       * new URL, so a cached copy can never become the wrong picture. If that
       * naming ever changes, this must change with it.
       */
      const uploadTask = uploadBytesResumable(storageRef, compressed, {
        cacheControl: "public, max-age=31536000, immutable",
      });

      return new Promise((resolve, reject) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (onProgress && snapshot.totalBytes > 0) {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onProgress(pct);
            }
          },
          async (err) => {
            console.warn("[Storage Engine] Storage upload failed, trying inline fallback:", err.message);
            const dataUrl = await fileToDataURL(compressed);
            if (dataUrlBytes(dataUrl) > MAX_INLINE_BYTES) {
              // Failing here is the point. Silently inlining a photo made the
              // upload look successful while quietly making every customer's
              // app slower, with nothing to connect the two.
              reject(new Error(
                "Image upload failed and the file is too large to store inline. " +
                "This usually means Firebase Storage CORS is not configured. " +
                "Fix Storage, or use an image under 100 KB."
              ));
              return;
            }
            resolve(dataUrl);
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            } catch (e) {
              const dataUrl = await fileToDataURL(compressed);
              if (dataUrlBytes(dataUrl) > MAX_INLINE_BYTES) {
                reject(new Error(
                  "Could not get a download URL and the file is too large to " +
                  "store inline. Check Firebase Storage configuration."
                ));
                return;
              }
              resolve(dataUrl);
            }
          }
        );
      });
    } else {
      // No Storage configured at all (local dev without Firebase). Still
      // capped — an uncapped inline image is the same problem here as anywhere.
      return await inlineWithinCap(compressed);
    }
  } catch (e) {
    /* ── Rethrow. Do NOT resurrect a failed upload as a data URL. ──────────
     *
     * This catch used to `return await fileToDataURL(file)` — uncompressed,
     * and with no size cap. The two handlers above take care to `reject()`
     * when a file is too large to inline, and every one of those rejections
     * landed here and was turned straight back into the giant data URL they
     * had just refused. The 100 KB guard was written and then bypassed one
     * level up.
     *
     * That is how `dietHeroBackgroundImageUrl` came to hold a ~300 KB base64
     * blob: the Storage write was denied, the guard said no, and this line
     * said yes anyway. The admin saw a successful upload; the customer app
     * received an image it had to download inside the settings document.
     *
     * `ImageUploader` already catches this and shows "Upload failed: …"
     * without calling `onChange`, so a genuine failure now reaches the person
     * who can fix it instead of being written to Firestore.
     */
    console.error("[Storage Engine] Upload failed:", e.message);
    throw e;
  }
};

export { storage };
