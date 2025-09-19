(function() {
  const viewRoot = document.getElementById('viewRoot');
  const tabs = {
    search: document.getElementById('tabSearch'),
    likes: document.getElementById('tabLikes'),
    profile: document.getElementById('tabProfile')
  };

  const urlParams = new URLSearchParams(location.search);
  const paramUserId = urlParams.get('id');

  // Simple local storage helpers
  const storage = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };

  // Mock profiles (используются если API не доступен)
  const mockProfiles = [
    { id: 'u1', name: 'Алексей', age: 28, city: 'Санкт-Петербург', bio: 'Спортивный, активный, люблю горы и море. Занимаюсь фитнесом, играю на гитаре.', tags:['Спорт','Гитара','Горы','+2'], photo: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?q=80&w=1200&auto=format&fit=crop', tg: '@alex_demo' },
    { id: 'u2', name: 'Марина', age: 27, city: 'Казань', bio: 'Обожаю кофе и долгие прогулки. Фотографирую закаты.', tags:['Кофе','Прогулки','Фото'], photo: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?q=80&w=1200&auto=format&fit=crop', tg: '@marina_demo' },
    { id: 'u3', name: 'Игорь', age: 25, city: 'Москва', bio: 'Фанат настолок и кинематографа. Ищу единомышленников.', tags:['Настолки','Кино'], photo: 'https://images.unsplash.com/photo-1548159417-5c0b5a5a3a44?q=80&w=1200&auto=format&fit=crop', tg: '@igor_demo' },
    { id: 'u4', name: 'Егор', age: 23, city: 'Сочи', bio: 'Сёрфинг, бег и свежий воздух.', tags:['Сёрф','Бег'], photo: 'https://images.unsplash.com/photo-1601288496920-c8e411aec475?q=80&w=1200&auto=format&fit=crop', tg: '@egor_demo' }
  ];

  const API_IMG = (photoPath) => {
    try {
      const base = String(photoPath || '').split('/').pop();
      if (!base) return null;
      return `http://127.0.0.1:8080/images/${encodeURIComponent(base)}`;
    } catch { return null; }
  };

  // App state
  const state = {
    me: storage.get('me', null),
    queue: storage.get('queue', mockProfiles),
    likes: storage.get('likes', []), // whom I liked
    passes: storage.get('passes', []),
    matches: storage.get('matches', []), // mutual
    likedMe: storage.get('likedMe', ['u2']) // demo: who liked me
  };

  function saveState() {
    storage.set('me', state.me);
    storage.set('queue', state.queue);
    storage.set('likes', state.likes);
    storage.set('passes', state.passes);
    storage.set('matches', state.matches);
    storage.set('likedMe', state.likedMe);
  }

  async function fetchUser(uid) {
    try {
      const r = await fetch(`http://127.0.0.1:8080/user?id=${encodeURIComponent(uid)}`);
      if (!r.ok) return null;
      const u = await r.json();
      return u;
    } catch { return null; }
  }

  async function fetchProfilesByCity(city) {
    try {
      const resp = await fetch(`http://127.0.0.1:8080/profiles?city=${encodeURIComponent(city||'')}`);
      if (!resp.ok) throw new Error('bad');
      const data = await resp.json();
      return Array.isArray(data.profiles) ? data.profiles : [];
    } catch {
      return null; // сигнал использовать мок
    }
  }

  // Ensure queue and incoming likes respect user's city
  async function ensureQueueForCity() {
    if (!state.me || !state.me.city) return;
    const city = state.me.city.trim();
    const apiProfiles = await fetchProfilesByCity(city);
    const baseRaw = apiProfiles && apiProfiles.length ? apiProfiles : mockProfiles.filter(p => p.city === city);
    const excluded = new Set([ 'me', ...state.passes, ...state.likes, ...state.matches.map(m => m.id) ]);
    const selfTg = (state.me.tg || '').toLowerCase();
    const withPhotos = baseRaw.map(p => ({
      ...p,
      photo: API_IMG(p.photo_path) || p.photo
    }));
    const base = withPhotos.filter(p => !excluded.has(p.id) && (p.tg||'').toLowerCase() !== selfTg);
    state.queue = base;
    state.likedMe = (state.likedMe || []).filter(id => {
      const p = (withPhotos||mockProfiles).find(x => x.id === id);
      return p && p.city === city && (p.tg||'').toLowerCase() !== selfTg;
    });
    saveState();
  }

  // On load: if opened from bot with ?id=, preload profile
  (async () => {
    if (paramUserId && !state.me) {
      const u = await fetchUser(paramUserId);
      if (u && u.id) {
        state.me = {
          id: 'me',
          name: u.name,
          age: u.age,
          city: u.city,
          bio: u.bio,
          tags: u.tags || [],
          photo: API_IMG(u.photo_path) || u.photo || 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=1200&auto=format&fit=crop',
          tg: u.tg || ''
        };
        saveState();
      }
    }
    render();
  })();

  // Views
  async function render() {
    const active = document.querySelector('.bottom-nav__btn--active');
    const tab = active?.id === 'tabLikes' ? 'likes' : active?.id === 'tabProfile' ? 'profile' : 'search';
    if (!state.me) {
      viewRoot.innerHTML = '<div class="list"><div class="list-item">Зарегистрируйтесь в боте, затем откройте MiniApp из бота.</div></div>';
      return;
    } else {
      await ensureQueueForCity();
      if (tab === 'search') {
        renderSearch();
      } else if (tab === 'likes') {
        renderLikes();
      } else {
        renderProfile();
      }
    }
  }

  function renderOnboarding() { /* больше не используется, оставлено на всякий случай */ }

  async function renderSearch() {
    if (state.queue.length === 0) {
      viewRoot.innerHTML = '<div class="list"><div class="list-item">Анкет в вашем городе нет. Создайте её и станьте первым!</div></div>';
      return;
    }
    const top = state.queue[0];
    viewRoot.innerHTML = '' +
      '<div class="card-stack">\n' +
      '  <article class="card">\n' +
      `    <img class="card__photo" src="${top.photo}" alt="${top.name}">\n` +
      '    <div class="card__info">\n' +
      `      <div class="card__title">${top.name}<span class="card__age">, ${top.age}</span></div>\n` +
      `      <div class="card__meta">📍 ${top.city || 'Город не указан'}</div>\n` +
      `      <div class="card__bio">${top.bio || ''}</div>\n` +
      `      <div class="chips">${(top.tags||[]).map(t=>`<span class=\"chip\">${t}</span>`).join('')}</div>\n` +
      '    </div>\n' +
      '    <div class="card-actions">\n' +
      '      <button id="btnPass" class="btn-round btn-pass">✖</button>\n' +
      '      <button id="btnLike" class="btn-round btn-like">❤</button>\n' +
      '    </div>\n' +
      '  </article>\n' +
      '</div>';

    document.getElementById('btnPass').addEventListener('click', () => handleDecision('pass', top));
    document.getElementById('btnLike').addEventListener('click', () => handleDecision('like', top));
  }

  function handleDecision(type, profile) {
    state.queue = state.queue.filter(p => p.id !== profile.id);
    if (type === 'like') {
      if (!state.likes.includes(profile.id)) state.likes.push(profile.id);
      if (state.likedMe.includes(profile.id) && !state.matches.find(m => m.id === profile.id)) {
        state.matches.push({ id: profile.id, name: profile.name, photo: profile.photo, tg: profile.tg });
      }
    } else {
      state.passes.push(profile.id);
    }
    saveState();
    render();
  }

  function renderLikes() {
    if (!state.likedMe.length) {
      viewRoot.innerHTML = '<div class="list"><div class="list-item">Пока нет симпатий. Продолжай искать!</div></div>';
      return;
    }
    const city = state.me?.city;
    const selfTg = (state.me?.tg || '').toLowerCase();
    const pool = state.queue.concat(mockProfiles).map(p => ({...p, photo: API_IMG(p.photo_path) || p.photo }));
    const likedProfiles = state.likedMe
      .map(id => pool.find(p => p.id === id))
      .filter(p => p && (!city || p.city === city) && (p.tg||'').toLowerCase() !== selfTg);
    if (!likedProfiles.length) {
      viewRoot.innerHTML = '<div class="list"><div class="list-item">Симпатий в вашем городе пока нет.</div></div>';
      return;
    }
    const items = likedProfiles.map(p => {
      const isMutual = state.likes.includes(p.id) || state.matches.find(m => m.id === p.id);
      const actions = isMutual
        ? `<div style=\"color:#88f\">Взаимная симпатия! TG: <b>${p.tg || '@username'}</b></div>`
        : `<div style=\"display:flex; gap:8px;\">`
          + `<button data-act=\"view\" data-id=\"${p.id}\" class=\"button\" style=\"background:#3a3f45;\">Профиль</button>`
          + `<button data-act=\"pass\" data-id=\"${p.id}\" class=\"button\" style=\"background:#444;\">Отклонить</button>`
          + `<button data-act=\"like\" data-id=\"${p.id}\" class=\"button\">Взаимно</button>`
          + `</div>`;
      return (
        `<div class=\"list-item\">`
        + `<div style=\"display:flex;align-items:center;gap:12px;\">`
        + `  <img src=\"${p.photo}\" alt=\"${p.name}\" style=\"width:48px;height:48px;border-radius:50%;object-fit:cover;\"/>`
        + `  <div style=\"flex:1;\">${p.name}, ${p.age} — ${p.city||''}<div style=\"opacity:.8;font-size:12px;\">${p.bio||''}</div></div>`
        + `</div>`
        + `<div style=\"margin-top:8px;\">${actions}</div>`
        + `</div>`
      );
    }).join('');
    viewRoot.innerHTML = `<div class=\"list\">${items}</div>`;

    viewRoot.querySelectorAll('[data-act]')?.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const act = e.currentTarget.getAttribute('data-act');
        const p = pool.find(x => x.id === id);
        if (!p) return;
        if (act === 'view') {
          state.queue = [p].concat(state.queue.filter(x => x.id !== p.id));
          tabs.search.click();
        } else if (act === 'pass') {
          state.likedMe = state.likedMe.filter(x => x !== id);
          saveState();
          renderLikes();
        } else if (act === 'like') {
          if (!state.likes.includes(id)) state.likes.push(id);
          if (!state.matches.find(m => m.id === id)) state.matches.push({ id: p.id, name: p.name, photo: p.photo, tg: p.tg });
          saveState();
          renderLikes();
        }
      });
    });
  }

  function renderProfile() {
    const me = state.me;
    if (!me) {
      viewRoot.innerHTML = '<div class="list"><div class="list-item">Зарегистрируйтесь в боте, затем откройте MiniApp из бота.</div></div>';
      return;
    }
    const preview = '' +
      '<article class="card" style="position:relative;inset:auto;margin-bottom:12px;max-height:420px;">\n' +
      `  <img class="card__photo" src="${me.photo}" alt="${me.name}">\n` +
      '  <div class="card__info">\n' +
      `    <div class="card__title">${me.name}<span class="card__age">, ${me.age||''}</span></div>\n` +
      `    <div class="card__meta">📍 ${me.city||'Город не указан'}</div>\n` +
      `    <div class="card__bio">${me.bio||''}</div>\n` +
      `    <div class="chips">${(me.tags||[]).map(t=>`<span class=\"chip\">${t}</span>`).join('')}</div>\n` +
      '  </div>\n' +
      '</article>';

    viewRoot.innerHTML = preview +
      '<div class="form">\n' +
      `  <img src="${me.photo}" alt="${me.name}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;"/>\n` +
      `  <input id="pName" class="input" value="${me.name}"/>\n` +
      `  <input id="pAge" class="input" type="number" value="${me.age}"/>\n` +
      `  <input id="pCity" class="input" value="${me.city||''}" placeholder="Город"/>\n` +
      `  <textarea id="pBio" class="input" rows="3" placeholder="О себе">${me.bio||''}</textarea>\n` +
      `  <input id="pTags" class="input" value="${(me.tags||[]).join(', ')}" placeholder="Теги"/>\n` +
      `  <input id="pPhoto" class="input" value="${me.photo}"/>\n` +
      `  <input id="pTG" class="input" value="${me.tg||''}" placeholder="Telegram @username"/>\n` +
      '  <button id="pSave" class="button">Сохранить</button>\n' +
      '  <button id="pReset" class="button" style="background:#444;">Сбросить данные</button>\n' +
      '</div>';

    document.getElementById('pSave').addEventListener('click', async () => {
      me.name = (document.getElementById('pName')).value.trim() || me.name;
      me.age = parseInt((document.getElementById('pAge')).value, 10) || me.age;
      me.city = (document.getElementById('pCity')).value.trim();
      me.bio = (document.getElementById('pBio')).value.trim();
      me.tags = (document.getElementById('pTags')).value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,5);
      me.photo = (document.getElementById('pPhoto')).value.trim() || me.photo;
      me.tg = (document.getElementById('pTG')).value.trim() || me.tg;
      await ensureQueueForCity();
      saveState();
      renderProfile();
    });
    document.getElementById('pReset').addEventListener('click', () => {
      if (confirm('Сбросить локальные данные?')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  Object.values(tabs).forEach(btn => {
    btn.addEventListener('click', () => {
      Object.values(tabs).forEach(b => b.classList.remove('bottom-nav__btn--active'));
      btn.classList.add('bottom-nav__btn--active');
      render();
    });
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js');
    });
  }
})();


