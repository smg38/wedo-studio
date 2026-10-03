const messages = (function () { let pollTimer = null; let currentTab = 'inbox'; let inbox = []; let sent = []; let replyTarget = null; let initialized = false; const BROADCAST_LABELS = { 'all@admin': 'Администрация', 'all@teacher': 'Учителя', 'all@user': 'Ученики' }; function allowedBroadcasts(role) { if (role === 'admin') return ['all@admin', 'all@teacher', 'all@user']; return ['all@admin']; } function currentUser() { try { return JSON.parse(localStorage.getItem(APP_CONFIG.SESSION_KEY) || '{}'); } catch (e) { return {}; } } function startPolling() { stopPolling(); pollTimer = setInterval(refresh, 30000); refresh(); } function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; } async function refreshUnread() { if (!WeDoApi.getToken() || document.hidden) return; try { const data = await WeDoApi.getUnreadCount(); updateBadge(data.count || 0); } catch (e) { if (e.message.includes('401') || e.message.toLowerCase().includes('авторизац')) { stopPolling(); } } } async function refreshMessages() { const overlay = document.getElementById('messages-overlay'); if (!WeDoApi.getToken() || document.hidden || overlay?.style.display !== 'flex') return; const list = document.getElementById('messages-list'); const showingDetail = Boolean(list?.querySelector('.message-detail')); await loadMessages(); if (!showingDetail) renderList(); } async function refresh() { await Promise.all([refreshUnread(), refreshMessages()]); } function updateBadge(count) { const badge = document.getElementById('unread-badge'); if (!badge) return; badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = count > 0 ? 'inline-block' : 'none'; } function updateInboxCount() { const count = document.getElementById('inbox-count'); if (count) count.textContent = inbox.length ? String(inbox.length) : ''; } async function open() { const overlay = document.getElementById('messages-overlay'); if (!overlay) return; overlay.style.display = 'flex'; buildRecipientDropdown(); await loadMessages(); renderList(); } function close() { const overlay = document.getElementById('messages-overlay'); if (overlay) overlay.style.display = 'none'; cancelReply(); } async function loadMessages() { try { const data = await WeDoApi.getMessages(); const user = currentUser(); const all = data.messages || []; inbox = all.filter(message => message.name_to === user.login || message.name_to === `all@${user.role}` ); sent = all.filter(message => message.name_from === user.login); updateBadge(inbox.filter(message => !message.read).length); updateInboxCount(); } catch (e) { showStatus('❌ ' + e.message, '#e74c3c'); } } function switchTab(tab) { if (tab !== 'inbox' && tab !== 'sent') return; currentTab = tab; document.querySelectorAll('#messages-overlay .tab').forEach(button => { button.classList.toggle('active', button.dataset.tab === tab); }); renderList(); } function renderList() { const list = document.getElementById('messages-list'); if (!list) return; const items = currentTab === 'inbox' ? inbox : sent; if (items.length === 0) { list.innerHTML = `<div class="messages-empty">${currentTab === 'inbox' ? 'Входящих нет' : 'Отправленных нет'}</div>`; return; } list.innerHTML = items.map(renderRow).join(''); } function renderRow(message) { const user = currentUser(); const isInbox = message.name_to === user.login || message.name_to === `all@${user.role}`; const target = isInbox ? message.name_from : message.name_to; const targetLabel = escapeHtml(BROADCAST_LABELS[target] || target); const readMark = isInbox ? (message.read ? '✓' : '●') : ''; const unreadClass = isInbox && !message.read ? 'unread' : ''; const adminDelete = user.role === 'admin' ? `<button class="msg-btn msg-btn-danger" onclick="messages.deleteForAll(${Number(message.id)})">Удалить у всех</button>` : ''; return `
            <div class="message-row ${unreadClass}" data-id="${Number(message.id)}">
                <div class="message-header">
                    <span class="message-target">${readMark} ${isInbox ? 'от' : 'кому'} <b>${targetLabel}</b></span>
                    <span class="message-date">${escapeHtml(formatDate(message.created_at))}</span>
                </div>
                <div class="message-text">${escapeHtml(message.message).slice(0, 200)}</div>
                <div class="message-actions">
                    <button class="msg-btn" onclick="messages.openMessage(${Number(message.id)})">Открыть</button>
                    <button class="msg-btn" onclick="messages.replyTo(${Number(message.id)})">Ответить</button>
                    <button class="msg-btn msg-btn-danger" onclick="messages.deleteForMe(${Number(message.id)})">Удалить у меня</button>
                    ${adminDelete}
                </div>
            </div>
        `; } async function openMessage(id) { const message = [...inbox, ...sent].find(item => Number(item.id) === Number(id)); if (!message) return; const user = currentUser(); const isInbox = message.name_to === user.login || message.name_to === `all@${user.role}`; const adminDelete = user.role === 'admin' ? `<button class="msg-btn msg-btn-danger" onclick="messages.deleteForAll(${Number(message.id)})">Удалить у всех</button>` : ''; if (isInbox && !message.read) { try { await WeDoApi.markMessageRead(message.id); message.read = true; updateBadge(inbox.filter(item => !item.read).length); } catch (e) { showStatus('❌ ' + e.message, '#e74c3c'); } } const list = document.getElementById('messages-list'); if (!list) return; list.innerHTML = `
            <div class="message-detail">
                <div class="message-detail-header">
                    <button class="msg-btn" onclick="messages.renderList()">← Назад</button>
                    <span class="message-date">${escapeHtml(formatDate(message.created_at))}</span>
                </div>
                <div class="message-detail-from">
                    <b>${escapeHtml(message.name_from)}</b> → <b>${escapeHtml(BROADCAST_LABELS[message.name_to] || message.name_to)}</b>
                </div>
                <div class="message-detail-body">${escapeHtml(message.message)}</div>
                ${message.reply_to_id ? `<div class="message-detail-reply">Ответ на #${Number(message.reply_to_id)}</div>` : ''}
                <button class="btn btn-primary" onclick="messages.replyTo(${Number(message.id)})">Ответить</button>
                <button class="msg-btn msg-btn-danger" onclick="messages.deleteForMe(${Number(message.id)})">Удалить у меня</button>
                ${adminDelete}
            </div>
        `; } async function deleteForMe(id) { const message = [...inbox, ...sent].find(item => Number(item.id) === Number(id)); if (!message || !window.confirm('Удалить сообщение только из вашей переписки?')) return; try { await WeDoApi.deleteMessage(message.id); inbox = inbox.filter(item => Number(item.id) !== Number(id)); sent = sent.filter(item => Number(item.id) !== Number(id)); updateBadge(inbox.filter(item => !item.read).length); updateInboxCount(); renderList(); showStatus('Сообщение удалено у вас', '#627282'); } catch (e) { showStatus('❌ ' + e.message, '#e74c3c'); } } async function deleteForAll(id) { const user = currentUser(); const message = [...inbox, ...sent].find(item => Number(item.id) === Number(id)); if (user.role !== 'admin' || !message) return; if (!window.confirm('Удалить сообщение у всех пользователей? Это действие необратимо.')) return; try { await WeDoApi.deleteMessageForAll(message.id); inbox = inbox.filter(item => Number(item.id) !== Number(id)); sent = sent.filter(item => Number(item.id) !== Number(id)); updateBadge(inbox.filter(item => !item.read).length); updateInboxCount(); renderList(); showStatus('Сообщение удалено у всех', '#627282'); } catch (e) { showStatus('❌ ' + e.message, '#e74c3c'); } } function replyTo(id) { const message = [...inbox, ...sent].find(item => Number(item.id) === Number(id)); if (!message) return; const target = message.name_from.startsWith('all@') ? 'all@admin' : message.name_from; replyTarget = { message_id: message.id, name_to: target, preview: String(message.message || '').slice(0, 100) }; const select = document.getElementById('msg-to'); if (select) { if (![...select.options].some(option => option.value === target)) { const option = document.createElement('option'); option.value = target; option.textContent = target; select.appendChild(option); } select.value = target; } const context = document.getElementById('message-reply-context'); const contextText = document.getElementById('reply-context-text'); if (context && contextText) { contextText.textContent = replyTarget.preview; context.style.display = 'flex'; } document.getElementById('msg-text')?.focus(); } function cancelReply() { replyTarget = null; const context = document.getElementById('message-reply-context'); if (context) context.style.display = 'none'; } async function send() { const select = document.getElementById('msg-to'); const textarea = document.getElementById('msg-text'); const nameTo = select?.value || ''; const message = textarea?.value.trim() || ''; if (!nameTo) { showStatus('Выберите получателя', '#ff6600'); return; } if (!message) { showStatus('Введите текст', '#ff6600'); return; } const payload = { name_to: nameTo, message }; if (replyTarget) payload.reply_to_id = replyTarget.message_id; try { await WeDoApi.sendMessage(payload); textarea.value = ''; const counter = document.getElementById('msg-counter'); if (counter) counter.textContent = '0 / 4000'; cancelReply(); showStatus('✅ Отправлено', '#2ECC71'); await loadMessages(); renderList(); setTimeout(() => showStatus('', ''), 2000); } catch (e) { showStatus('❌ ' + e.message, '#e74c3c'); } } function buildRecipientDropdown() { const select = document.getElementById('msg-to'); if (!select) return; const user = currentUser(); select.innerHTML = ''; for (const address of allowedBroadcasts(user.role)) { const option = document.createElement('option'); option.value = address; option.textContent = BROADCAST_LABELS[address]; select.appendChild(option); } WeDoApi.getUsers().then(data => { const users = (data.users || []).filter(item => item.login !== user.login); if (!users.length) return; const separator = document.createElement('option'); separator.disabled = true; separator.textContent = '────────'; select.appendChild(separator); for (const item of users) { const option = document.createElement('option'); option.value = item.login; option.textContent = `${item.name} (${item.login})`; select.appendChild(option); } }).catch(() => {}); } function formatDate(value) { if (!value) return ''; const date = new Date(String(value).replace(' ', 'T') + 'Z'); if (Number.isNaN(date.getTime())) return ''; const seconds = (Date.now() - date.getTime()) / 1000; if (seconds < 60) return 'только что'; if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`; if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`; return date.toLocaleDateString('ru') + ' ' + date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }); } function escapeHtml(value) { return String(value || '') .replace(/&/g, '&amp;') .replace(/</g, '&lt;') .replace(/>/g, '&gt;') .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showStatus(text, color) {
        const status = document.getElementById('msg-status');
        if (!status) return;
        status.textContent = text;
        status.style.color = color || '';
    }

    function init() {
        if (initialized) return;
        initialized = true;
        const textarea = document.getElementById('msg-text');
        if (textarea) {
            textarea.addEventListener('input', () => {
                const counter = document.getElementById('msg-counter');
                if (counter) counter.textContent = `${textarea.value.length} / 4000`;
            });
        }
        startPolling();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refresh();
        });
    }

    return {
        init, open, close,
        switchTab, renderList, openMessage,
        replyTo, cancelReply, send, deleteForMe, deleteForAll,
        refreshUnread, startPolling, stopPolling
    };
})();

window.messages = messages;