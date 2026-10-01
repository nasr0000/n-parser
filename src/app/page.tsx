'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Bell, BellOff, Download, Trash2, Plus, Camera, RefreshCw } from 'lucide-react';

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

  useEffect(() => {
    // Подписка на аккаунты
    const unsubAccounts = onSnapshot(collection(db, 'accounts'), (snapshot) => {
      setAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Подписка на посты
    const qPosts = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubPosts = onSnapshot(qPosts, (snapshot) => {
      setPosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      
      // Сохраняем подписку в Firebase
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

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Навигация */}
      <nav className="bg-white shadow-sm border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2 text-pink-600 font-bold text-xl">
          <Camera /> InstaDash
        </div>
        <button 
          onClick={subscribeToPush}
          disabled={isSubscribed}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${
            isSubscribed ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {isSubscribed ? <BellOff size={18} /> : <Bell size={18} />}
          {isSubscribed ? 'Уведомления включены' : 'Включить Push'}
        </button>
      </nav>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-8 mt-6">
        {/* Левая колонка: Аккаунты */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              Мониторинг аккаунтов
            </h2>
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
          </div>
        </div>

        {/* Правая колонка: Лента */}
        <div className="md:col-span-2">
          <h2 className="text-2xl font-bold mb-6">Лента новых постов</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {posts.map(post => (
              <div key={post.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition">
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-600 flex items-center justify-center text-white font-bold text-xs">
                      {post.account?.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-bold text-sm">@{post.account}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">{post.text}</p>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => downloadVideo(post.videoUrl || post.url, post.id)}
                      disabled={downloading === post.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-900 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {downloading === post.id ? <RefreshCw className="animate-spin" size={16} /> : <Download size={16} />}
                      {downloading === post.id ? 'Скачивание...' : 'Скачать видео'}
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
        </div>
      </main>
    </div>
  );
}
