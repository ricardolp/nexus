const DEFAULT_SIZE = 150;
const DEFAULT_QUALITY = 0.9;
const DEFAULT_MIME = 'image/jpeg';

export async function resizeImageToSquare(
  file: File,
  size = DEFAULT_SIZE,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Não foi possível processar a imagem');
  }

  const cropSize = Math.min(bitmap.width, bitmap.height);
  const sourceX = (bitmap.width - cropSize) / 2;
  const sourceY = (bitmap.height - cropSize) / 2;

  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  return canvas.toDataURL(DEFAULT_MIME, DEFAULT_QUALITY);
}
