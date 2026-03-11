const STORAGE_KEY = 'gh_query_tool_config';

// UI Elements
const reposContainer = document.getElementById('repos-container');
const addRepoBtn = document.getElementById('add-repo-btn');
const runSearchBtn = document.getElementById('run-search-btn');
const resultsPanel = document.getElementById('results-panel');
const resultsContainer = document.getElementById('results-container');
const repoTemplate = document.getElementById('repo-item-template');
const tokenInput = document.getElementById('gh-token');
const keywordInput = document.getElementById('search-keyword');
const searchStatus = document.getElementById('search-status');
const debugLog = document.getElementById('debug-log');
const clearDebugBtn = document.getElementById('clear-debug-btn');

// Logger system
function log(msg, type = 'info') {
    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerText = `[${time}] ${msg}`;
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
    console.log(`[${type}] ${msg}`);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    log('Aplicación iniciada', 'system');
    loadConfig();
    if (reposContainer.children.length === 0) {
        addRepoRow();
    }
});

// Event Listeners
addRepoBtn.addEventListener('click', () => addRepoRow());
runSearchBtn.addEventListener('click', startSearch);
clearDebugBtn.addEventListener('click', () => {
    debugLog.innerHTML = '<p class="log-entry system">Consola limpiada</p>';
});

function addRepoRow(url = '', branch = 'main') {
    const row = repoTemplate.content.cloneNode(true);
    const urlInput = row.querySelector('.repo-url');
    const branchInput = row.querySelector('.repo-branch');
    const removeBtn = row.querySelector('.remove-repo-btn');

    urlInput.value = url;
    branchInput.value = branch;

    removeBtn.addEventListener('click', (e) => {
        e.target.closest('.repo-item').remove();
        saveConfig();
    });

    // Save on change
    [urlInput, branchInput].forEach(input => {
        input.addEventListener('change', saveConfig);
    });

    reposContainer.appendChild(row);
}

function saveConfig() {
    const repos = [];
    document.querySelectorAll('.repo-item').forEach(item => {
        const url = item.querySelector('.repo-url').value.trim();
        const branch = item.querySelector('.repo-branch').value.trim();
        if (url) repos.push({ url, branch });
    });

    const config = {
        token: tokenInput.value,
        keyword: keywordInput.value,
        repos: repos
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const config = JSON.parse(saved);
        tokenInput.value = config.token || '';
        keywordInput.value = config.keyword || 'config.json';
        
        if (config.repos && config.repos.length > 0) {
            reposContainer.innerHTML = '';
            config.repos.forEach(repo => addRepoRow(repo.url, repo.branch));
        }
    }
}

async function startSearch() {
    const token = tokenInput.value.trim();
    const keyword = keywordInput.value.trim();
    const repos = [];

    document.querySelectorAll('.repo-item').forEach(item => {
        const url = item.querySelector('.repo-url').value.trim();
        const branch = item.querySelector('.repo-branch').value.trim();
        if (url) repos.push({ url, branch });
    });

    if (!token) {
        alert('Por favor, ingresa tu GitHub Token.');
        return;
    }
    if (!keyword) {
        alert('Ingresa una palabra clave a buscar.');
        return;
    }
    if (repos.length === 0) {
        alert('Añade al menos un repositorio.');
        return;
    }

    saveConfig();
    
    resultsPanel.classList.remove('hidden');
    resultsContainer.innerHTML = '';
    searchStatus.innerHTML = '<span style="color:var(--primary)">Ocupado...</span>';
    runSearchBtn.disabled = true;
    runSearchBtn.innerHTML = '<div class="loading-spinner"></div> Buscando...';

    log(`Iniciando búsqueda para "${keyword}" en ${repos.length} repositorios`, 'system');

    try {
        log('Validando Token de GitHub...', 'info');
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userRes.ok) {
            log(`Error de Validación: ${userRes.status}`, 'error');
            throw new Error(`Token inválido o expirado (${userRes.status}). Verifica tus permisos y SSO.`);
        }
        const userData = await userRes.json();
        log(`Autenticado como: ${userData.login}`, 'success');

        const results = await Promise.all(repos.map(repo => queryRepo(repo, keyword, token)));
        
        results.forEach(res => renderResult(res));
        searchStatus.innerHTML = '<span style="color:var(--accent)">Completado</span>';
        log('Búsqueda finalizada con éxito', 'system');
    } catch (err) {
        log(`Error Fatal: ${err.message}`, 'error');
        searchStatus.innerHTML = '<span style="color:#ef4444">Error Fatal</span>';
        resultsContainer.innerHTML = `<p style="padding:1rem; color:#ef4444; background:rgba(239,68,68,0.1); border-radius:1rem;">Error: ${err.message}</p>`;
    } finally {
        runSearchBtn.disabled = false;
        runSearchBtn.innerText = 'Iniciar Búsqueda Dinámica';
    }
}

async function queryRepo(repo, keyword, token) {
    log(`Interesado en: ${repo.url}`, 'info');
    try {
        let owner, repoName, urlBranch, urlPath;
        
        // Remove trailing .git, tokens and spaces
        let cleanUrl = repo.url.split('?')[0].trim().replace(/\.git$/, '').replace(/\/$/, '');
        
        // Match standard github URLs
        const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?$/);
        // Match raw github URLs
        const rawMatch = cleanUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/(?:refs\/heads\/)?([^\/]+)\/?(.*)$/);
        
        if (match) {
            owner = match[1];
            repoName = match[2];
            urlBranch = match[3];
        } else if (rawMatch) {
            owner = rawMatch[1];
            repoName = rawMatch[2];
            urlBranch = rawMatch[3];
            urlPath = rawMatch[4];
            log(`Detectado URL de contenido RAW. Repo: ${owner}/${repoName}`, 'success');
        } else if (cleanUrl.includes('/')) {
            const parts = cleanUrl.split('/').filter(p => p && p !== 'https:' && p !== 'github.com');
            owner = parts[parts.length - 2];
            repoName = parts[parts.length - 1];
        } else {
            throw new Error('Formato de URL no reconocido');
        }

        // Priority for branch: 1. Manual input, 2. URL branch, 3. main
        const targetBranch = repo.branch || urlBranch || 'main';
        // Priority for path: if keyword is provided, use it. If URL included a path and no keyword, use that.
        const path = (keyword && keyword !== 'config.json') ? keyword : (urlPath || keyword || 'config.json');
        
        log(`Objetivo: ${owner}/${repoName} | Rama: ${targetBranch} | Archivo: ${path}`, 'info');

        let items = [];
        let isDirectMatch = false;

        // STRATEGY 1: Direct Content Fetch (The most robust way for private/SSO repos)
        // Clean path (remove leading slash)
        const cleanPath = path.startsWith('/') ? path.substring(1) : path;
        const directUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${cleanPath}?ref=${targetBranch}`;
        
        log(`Pidiendo archivo directamente a GitHub API...`, 'info');
        const directRes = await fetch(directUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (directRes.ok) {
            const item = await directRes.json();
            if (!Array.isArray(item)) {
                log(`✅ Archivo localizado: ${item.path}`, 'success');
                items = [item];
                isDirectMatch = true;
            }
        } else {
            log(`GitHub respondió HTTP ${directRes.status}`, directRes.status === 404 ? 'warn' : 'error');
            if (directRes.status === 403) {
                log('Bloqueo 403: Es necesario autorizar el token para SSO en esta organización.', 'error');
            }
        }

        // STRATEGY 2: Fallback to Search API (Only if not a direct match attempt or direct failed)
        if (items.length === 0) {
            log(`Probando búsqueda global para "${keyword}"...`, 'info');
            const query = encodeURIComponent(`${keyword} repo:${owner}/${repoName}`);
            const response = await fetch(`https://api.github.com/search/code?q=${query}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                items = data.items || [];
                log(`Búsqueda encontró ${items.length} coincidencias.`, items.length > 0 ? 'success' : 'warn');
            }
        }

        // FETCH RAW CONTENT
        const fileResults = await Promise.all(items.slice(0, 5).map(async (item) => {
            try {
                // If it was a direct match, the item from /contents already has everything
                // We use the raw accept header to get the string content directly.
                const contentRes = await fetch(item.url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                });
                if (!contentRes.ok) throw new Error(`HTTP ${contentRes.status}`);
                
                const rawContent = await contentRes.text();
                return { path: item.path, content: rawContent };
            } catch (e) {
                return { path: item.path, error: e.message };
            }
        }));
        
        return {
            name: `${owner}/${repoName}`,
            branch: targetBranch,
            status: 'success',
            count: items.length,
            isDirectMatch: isDirectMatch,
            files: fileResults
        };

    } catch (err) {
        log(`Fallo en repo: ${err.message}`, 'error');
        return {
            name: repo.url,
            status: 'error',
            message: err.message
        };
    }
}

function renderResult(res) {
    if (res.status === 'success') {
        if (res.count > 0) {
            res.files.forEach((f, idx) => {
                const fileId = `file-${res.name.replace(/[^a-z0-9]/gi, '-')}-${idx}`;
                const div = document.createElement('div');
                div.className = 'echo-container';
                div.innerHTML = `
                    <pre id="${fileId}" class="file-content-raw echo-mode">${f.content ? escapeHtml(f.content) : (f.error || 'Sin contenido')}</pre>
                `;
                resultsContainer.appendChild(div);
            });
        }
    } else {
        const div = document.createElement('div');
        div.className = 'repo-result';
        let msg = res.message;
        if (msg.includes('403')) {
            msg = `<strong>Error 403 (Acceso Denegado):</strong> Tu Token requiere autorización SSO para <strong>planetaformacion</strong>.`;
        }
        div.innerHTML = `<p style="color: #ef4444; font-size: 0.88rem; margin-top: 10px; border-left: 3px solid #ef4444; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 0 0.75rem 0.75rem 0;">${msg}</p>`;
        resultsContainer.appendChild(div);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyToClipboard(id) {
    const el = document.getElementById(id);
    const text = el.innerText;
    navigator.clipboard.writeText(text).then(() => {
        alert('Contenido copiado al portapapeles');
    }).catch(err => {
        console.error('Error al copiar:', err);
    });
}
