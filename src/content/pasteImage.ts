import { maxImageBytes } from '../database/noteImages';

export async function readPastedImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请粘贴 PNG、JPEG 或 WebP 图片。');
  if (file.size > maxImageBytes) throw new Error('单张图片不能超过2MB。');
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('图片损坏或无法读取。'); });
  try {
    if (bitmap.width * bitmap.height > 16000000) throw new Error('图片不能超过1600万像素。');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法处理图片，请重试。');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片转换失败。')), 'image/png'));
    if (blob.size > maxImageBytes) throw new Error('转换后的图片超过2MB，请缩小图片后重试。');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('图片读取失败。'));
      reader.readAsDataURL(blob);
    });
  } finally { bitmap.close(); }
}
