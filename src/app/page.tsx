'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Bell, BellOff, Download, Trash2, Plus, Camera, RefreshCw, ExternalLink, Settings, X } from 'lucide-react';

// Утилита для конвертации VAPID ключа
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [newAccount, setNewAccount] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseLimit, setParseLimit] = useState(1);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    // Подписка на аккаунты
    const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Подписка на посты
    const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      // Сортируем по дате публикации (Instagram), fallback — дата добавления в базу
      loaded.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : (a.createdAt?.seconds * 1000 || 0);
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : (b.createdAt?.seconds * 1000 || 0);
        return dateB - dateA;
      });
      setPosts(loaded);
    });

    // Регистрация Service Worker
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
        });
      });
    }

    return () => {
      unsubAccounts();
      unsubPosts();
    };
  }, []);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.trim()) return;
    try {
      await addDoc(collection(db, 'accounts'), {
        username: newAccount.trim().replace('@', ''),
        addedAt: serverTimestamp()
      });
      setNewAccount('');
    } catch (err) {
      console.error(err);
      alert('Ошибка при добавлении');
    }
  };

  const handleRemoveAccount = async (id: string) => {
    if (confirm('Удалить аккаунт из мониторинга?')) {
      await deleteDoc(doc(db, 'accounts', id));
    }
  };

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator)) return alert('Браузер не поддерживает Service Workers');
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '')
      });

      // Удаляем ВСЕ старые подписки, чтобы не было дублей
      const { getDocs } = await import('firebase/firestore');
      const oldSubs = await getDocs(collection(db, 'subscriptions'));
      await Promise.all(oldSubs.docs.map(d => deleteDoc(doc(db, 'subscriptions', d.id))));
      
      // Сохраняем единственную свежую подписку
      await addDoc(collection(db, 'subscriptions'), {
        subscription: JSON.parse(JSON.stringify(sub)),
        createdAt: serverTimestamp()
      });
      
      setIsSubscribed(true);
      alert('Вы успешно подписались на уведомления!');
    } catch (e) {
      console.error(e);
      alert('Ошибка подписки на Push');
    }
  };

  const downloadVideo = async (url: string, id: string) => {
    try {
      setDownloading(id);
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      if (!res.ok) throw new Error('Ошибка скачивания');
      
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `video_${id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
      alert('Не удалось скачать видео');
    } finally {
      setDownloading(null);
    }
  };

  const handleRemovePost = async (id: string) => {
    if (confirm('Удалить этот пост?')) {
      await deleteDoc(doc(db, 'posts', id));
    }
  };

  const handleManualParse = async (limit?: number) => {
    try {
      setIsParsing(true);
      const res = await fetch(`/api/cron?limit=${limit || parseLimit}`);
      const data = await res.json();
      if (data.success) {
        alert(`Парсинг завершен! Найдено новых постов: ${data.newPosts}`);
      } else {
        alert('Ошибка парсинга: ' + (data.error || 'Неизвестная ошибка'));
      }
    } catch (e) {
      alert('Ошибка соединения с сервером');
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Навигация */}
      <nav className="bg-white shadow-sm border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-pink-600 font-bold text-xl">
          <Camera /> InstaDash
        </div>
        <div className="flex items-center gap-3">
          {/* Группа кнопок парсера с выбором количества */}
          <div className="flex items-center border rounded-full overflow-hidden bg-white">
            <button 
              onClick={() => handleManualParse()}
              disabled={isParsing}
              className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${
                isParsing ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-800 hover:bg-gray-50'
              }`}
            >
              <RefreshCw className={isParsing ? "animate-spin" : ""} size={18} />
              <span className="hidden sm:inline">{isParsing ? 'Ищем...' : 'Запустить'}</span>
            </button>
            <div className="w-px h-6 bg-gray-200" />
            <select
              value={parseLimit}
              onChange={(e) => setParseLimit(Number(e.target.value))}
              disabled={isParsing}
              className="pr-3 pl-2 py-2 bg-white text-gray-700 text-sm font-medium outline-none cursor-pointer disabled:opacity-50"
            >
              <option value={1}>1 пост</option>
              <option value={3}>3 поста</option>
              <option value={5}>5 постов</option>
              <option value={10}>10 постов</option>
            </select>
          </div>
          
          <button
            onClick={() => setShowSettings(s => !s)}
            className={`p-2 rounded-full transition-colors ${
              showSettings ? 'bg-pink-100 text-pink-600' : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Настройки"
          >
            <Settings size={20} />
          </button>
        </div>
      </nav>

      {/* Панель настроек аккаунтов (слайд справа) */}
      {showSettings && (
        <div className="fixed inset-0 z-20" onClick={() => setShowSettings(false)}>
          <div
            className="absolute right-0 top-0 h-full w-80 bg-white shadow-2xl border-l p-6 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold">Мониторинг аккаунтов</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-700 transition">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddAccount} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Имя профиля..."
                value={newAccount}
                onChange={(e) => setNewAccount(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-pink-500"
              />
              <button type="submit" className="bg-gray-900 text-white p-2 rounded-lg hover:bg-gray-800 transition">
                <Plus size={20} />
              </button>
            </form>
            <ul className="space-y-3">
              {accounts.map(acc => (
                <li key={acc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border">
                  <span className="font-medium text-sm">@{acc.username}</span>
                  <button onClick={() => handleRemoveAccount(acc.id)} className="text-red-500 hover:bg-red-50 p-1 rounded-md transition">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
              {accounts.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">Список пуст</p>
              )}
            </ul>

            {/* Кнопка уведомлений */}
            <div className="mt-6 pt-6 border-t">
              <p className="text-sm text-gray-500 mb-3">Пуш-уведомления</p>
              <button
                onClick={subscribeToPush}
                disabled={isSubscribed}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-colors ${
                  isSubscribed ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSubscribed ? <BellOff size={18} /> : <Bell size={18} />}
                {isSubscribed ? 'Уведомления включены' : 'Включить Push'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-screen-2xl mx-auto px-6 pb-6 mt-6">
        <h2 className="text-2xl font-bold mb-6">Лента новых постов</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {posts.map(post => (
              <div key={post.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
                {/* Превью изображение */}
                {post.thumbnailUrl && (
                  <div className="relative w-full aspect-square bg-gray-100 overflow-hidden">
                    <img 
                      src={post.thumbnailUrl} 
                      alt={`Пост от @${post.account}`}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                      {post.account?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm">@{post.account}</div>
                      {post.publishedAt && (
                        <div className="text-xs text-gray-400">
                          {new Date(post.publishedAt).toLocaleString('ru-RU', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </div>
                      )}
                    </div>
                    <a 
                      href={post.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-pink-600 transition flex-shrink-0"
                      title="Открыть оригинал"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                  <p className={`text-sm text-gray-600 mb-1 whitespace-pre-wrap ${
                    expandedPosts.has(post.id) ? '' : 'line-clamp-3'
                  }`}>{post.text}</p>
                  {post.text && post.text.length > 120 && (
                    <button
                      onClick={() => toggleExpand(post.id)}
                      className="text-xs text-pink-500 hover:text-pink-700 font-medium mb-3 transition"
                    >
                      {expandedPosts.has(post.id) ? '▲ Скрыть' : '▼ Показать полностью'}
                    </button>
                  )}
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => downloadVideo(post.videoUrl || post.url, post.id)}
                      disabled={downloading === post.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {downloading === post.id ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                      {downloading === post.id ? 'Скачивание...' : 'Скачать'}
                    </button>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center bg-pink-50 text-pink-600 hover:bg-pink-100 px-3 py-2.5 rounded-xl transition"
                      title="Открыть оригинальную публикацию"
                    >
                      <ExternalLink size={18} />
                    </a>
                    <button 
                      onClick={() => handleRemovePost(post.id)}
                      className="flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 px-3 py-2.5 rounded-xl transition"
                      title="Удалить пост"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {posts.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-2xl border border-dashed">
                Нет новых постов. Добавьте аккаунты для мониторинга.
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
