import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { api } from './api';

export interface LocalPhoto {
  uri: string;
  width: number;
  height: number;
}

const MAX_EDGE = 1600;

/** Opens the photo library (or camera). Must be called from a button press on web. */
export async function pickPhotos({ limit = 1, camera = false } = {}): Promise<LocalPhoto[]> {
  if (camera) {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return [];
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  };
  const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets) return [];
  return result.assets.slice(0, limit).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/**
 * Shrinks to 1600px on the long edge and re-encodes as JPEG. Re-encoding also
 * drops EXIF metadata, so a photo never carries the location it was taken at.
 */
async function prepare(photo: LocalPhoto) {
  const context = ImageManipulator.manipulate(photo.uri);
  const longEdge = Math.max(photo.width, photo.height);
  if (longEdge > MAX_EDGE) {
    context.resize(photo.width >= photo.height ? { width: MAX_EDGE, height: null } : { width: null, height: MAX_EDGE });
  }
  const image = await context.renderAsync();
  return image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
}

/** Uploads straight to storage with a signed URL, then confirms. Returns the photo id. */
export async function uploadPhoto(photo: LocalPhoto, kind: 'review' | 'avatar' | 'story' | 'plate') {
  const ready = await prepare(photo);
  const blob = await (await fetch(ready.uri)).blob();
  const { photoId, uploadUrl, headers } = await api.requestUpload({ kind, contentType: 'image/jpeg', bytes: blob.size });
  const put = await fetch(uploadUrl, { method: 'PUT', headers, body: blob });
  if (!put.ok) throw new Error('Upload failed. Check your connection and try again.');
  await api.confirmPhoto(photoId, { width: ready.width, height: ready.height });
  return { id: photoId, uri: ready.uri };
}
