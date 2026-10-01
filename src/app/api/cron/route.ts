import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import webpush from 'web-push';
import { ApifyClient } from 'apify-client';

export async function GET(req: NextRequest) {
  try {
    // Настройка web-push
    webpush.setVapidDetails(
      'mailto:your_email@example.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || ''
    );
    
    const adminDb = getAdminDb();
    
    // Количество постов: из query-параметра или 1 по умолчанию
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '1'), 10);
    
    // Инициализация Apify
    const client = new ApifyClient({
        token: process.env.APIFY_API_TOKEN,
    });
    
    // Получаем аккаунты
    const accountsSnapshot = await adminDb.collection('accounts').get();
    const usernames = accountsSnapshot.docs.map(doc => (doc.data() as any).username);
    
    if (usernames.length === 0) {
      return NextResponse.json({ success: true, newPosts: 0, message: "No accounts to monitor" });
    }

    // Формируем прямые ссылки на профили для Apify
    const directUrls = usernames.map(u => `https://www.instagram.com/${u}/`);

    // Запускаем Instagram Scraper от Apify
    const run = await client.actor("apify/instagram-scraper").call({
        directUrls: directUrls,
        resultsType: "posts",
        resultsLimit: limit,
    });

    // Получаем результаты
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    
    let newPostsCount = 0;

    for (const item of items as any[]) {
      const url = item.url || '';
      
      // Пропускаем странные пустые объекты
      if (!url) continue;

      const username = item.ownerUsername || item.username || 'unknown';
      const id = String(item.id || item.shortCode || '').trim();
      const docId = id || url.replace(/[^a-zA-Z0-9]/g, '_');

      // Проверяем, есть ли уже этот пост в базе (чтобы не пушить повторно)
      const postRef = adminDb.collection('posts').doc(docId);
      const postSnap = await postRef.get();
      
      if (!postSnap.exists) {
        // Новый пост!
        const postData = {
          id: docId,
          url: url,
          videoUrl: item.videoUrl || item.displayUrl || url,
          thumbnailUrl: item.displayUrl || item.thumbnailUrl || item.previewUrl || '',
          text: item.caption || `Новое видео от @${username}!`,
          account: username,
          publishedAt: (() => {
            try {
              const ts = item.timestamp;
              if (!ts) return null;
              // Если уже строка ISO — используем как есть
              if (typeof ts === 'string') return new Date(ts).toISOString();
              // Если число — проверяем секунды vs миллисекунды
              const ms = ts > 1e10 ? ts : ts * 1000;
              const d = new Date(ms);
              return isNaN(d.getTime()) ? null : d.toISOString();
            } catch { return null; }
          })(),
          createdAt: FieldValue.serverTimestamp()
        };

        // Сохраняем
        await postRef.set(postData);
        newPostsCount++;

        // Отправляем Push
        const subsSnapshot = await adminDb.collection('subscriptions').get();
        const payload = JSON.stringify({
          title: `📸 Новый пост от @${username}`,
          body: (item.caption || '').slice(0, 100) || 'Нажмите, чтобы открыть или скачать.',
          image: postData.thumbnailUrl || '',
          url: '/'  // Открываем наш InstaDash, а не Instagram
        });

        subsSnapshot.forEach(async (doc) => {
          const sub = doc.data().subscription;
          try {
            await webpush.sendNotification(sub, payload);
          } catch (e: any) {
            if (e.statusCode === 410) {
              await doc.ref.delete();
            }
          }
        });
      }
    }

    return NextResponse.json({ success: true, newPosts: newPostsCount });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
  }
}
