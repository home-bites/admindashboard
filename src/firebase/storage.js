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
      const uploadTask = uploadBytesResumable(storageRef, compressed);

      return new Promise((resolve) => {
        uploadTask.on(
          "state_changed",
          (snapshot) => {
            if (onProgress && snapshot.totalBytes > 0) {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onProgress(pct);
            }
          },
          async (err) => {
            console.warn("[Storage Engine] Firebase Storage upload error/CORS warning, using resilient DataURL fallback:", err.message);
            const dataUrl = await fileToDataURL(compressed);
            resolve(dataUrl);
          },
          async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            } catch (e) {
              const dataUrl = await fileToDataURL(compressed);
              resolve(dataUrl);
            }
          }
        );
      });
    } else {
      return await fileToDataURL(compressed);
    }
  } catch (e) {
    console.warn("[Storage Engine] Exception during upload, resolving with DataURL:", e.message);
    return await fileToDataURL(file);
  }
};

export { storage };
