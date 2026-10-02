import { NextRequest, NextResponse } from 'next/server';
import { ApifyClient } from 'apify-client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');
    const limit = Math.min(parseInt(searchParams.get('limit') || '12'), 50);
    const skip = Math.max(parseInt(searchParams.get('skip') || '0'), 0);
    const total = skip + limit; // Загружаем столько, сколько нужно с учётом skip

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

    const run = await client.actor('apify/instagram-scraper').call({
      directUrls: [`https://www.instagram.com/${username}/`],
      resultsType: 'posts',
      resultsLimit: total,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const allPosts = (items as any[])
      .filter(item => item.url)
      .map(item => ({
        id: String(item.id || item.shortCode || item.url),
        url: item.url,
        videoUrl: item.videoUrl || item.displayUrl || item.url,
        thumbnailUrl: item.displayUrl || item.thumbnailUrl || '',
        text: item.caption || '',
        type: item.type || (item.videoUrl ? 'Video' : 'Image'),
        publishedAt: (() => {
          try {
            const ts = item.timestamp;
            if (!ts) return null;
            if (typeof ts === 'string') return new Date(ts).toISOString();
            const ms = ts > 1e10 ? ts : ts * 1000;
            const d = new Date(ms);
            return isNaN(d.getTime()) ? null : d.toISOString();
          } catch { return null; }
        })(),
      }));

    // Возвращаем только новую порцию (начиная с skip)
    const newPosts = allPosts.slice(skip);

    return NextResponse.json({ success: true, posts: newPosts, total: allPosts.length });
  } catch (error: any) {
    console.error('[API Browse] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
  }
}
