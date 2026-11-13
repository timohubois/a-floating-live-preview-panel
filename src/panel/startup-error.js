// Initialization failures remove only this plugin's UI; native editing and revision controls remain usable.
export function showStartupError(message, error) {
    document.getElementById('aflpp-panel')?.remove();
    document.getElementById('aflpp-toggle')?.remove();
    const notice = document.createElement('div');
    notice.className = 'notice notice-error';
    notice.setAttribute('role', 'alert');
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    notice.append(paragraph);
    (document.getElementById('wpbody-content') || document.body).prepend(notice);
    console.error('A Floating Live Preview Panel could not start.', error);
}
