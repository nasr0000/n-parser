import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Неверная ссылка' }, { status: 400 });
    }

    console.log(`[API Download] Проксирование прямой ссылки: ${url}...`);

    // Если это прямая ссылка (от Apify), мы можем скачать её напрямую, без yt-dlp
    if (url.includes('.mp4') || url.includes('.jpg') || url.includes('scontent')) {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Ошибка скачивания файла: ${response.statusText}`);
      }

      // Возвращаем поток напрямую клиенту (обход CORS)
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="instagram_media_${Date.now()}"`,
        },
      });
    } else {
       return NextResponse.json({ error: 'Сервер больше не поддерживает скачивание через yt-dlp. Запустите крон снова, чтобы получить прямые ссылки от Apify.' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[API Download] Ошибка:', error.message);
    return NextResponse.json({ error: 'Ошибка при скачивании файла' }, { status: 500 });
  }
}
