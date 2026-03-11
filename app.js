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
    log(`Consultando repo: ${repo.url}`, 'info');
    try {
        // Robust owner/repo extraction
        let owner, repoName, urlBranch;
        
        // Remove trailing .git and spaces
        let cleanUrl = repo.url.trim().replace(/\.git$/, '').replace(/\/$/, '');
        
        // Match standard github URLs
        const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?$/);
        
        if (match) {
            owner = match[1];
            repoName = match[2];
            urlBranch = match[3];
        } else if (cleanUrl.includes('/')) {
            const parts = cleanUrl.split('/').filter(p => p && p !== 'https:' && p !== 'github.com');
            owner = parts[parts.length - 2];
            repoName = parts[parts.length - 1];
        } else {
            throw new Error('Formato de URL o nombre de repo inválido');
        }

        const targetBranch = repo.branch || urlBranch || 'main';
        log(`Repositorio detectado: ${owner}/${repoName} (Rama: ${targetBranch})`, 'info');

        let items = [];
        let isDirectMatch = false;

        // STRATEGY 1: Direct Content Fetch (Reliable for specific files like config.json)
        if (keyword.includes('.') && !keyword.includes(' ')) {
            log(`Intento de búsqueda directa: ${keyword} en rama ${targetBranch}...`, 'info');
            const path = keyword.startsWith('/') ? keyword.substring(1) : keyword;
            const directUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${targetBranch}`;
            
            const directRes = await fetch(directUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (directRes.ok) {
                const item = await directRes.json();
                if (!Array.isArray(item)) {
                    log(`✅ ¡Archivo encontrado directamente! (${item.path})`, 'success');
                    items = [item];
                    isDirectMatch = true;
                }
            } else {
                log(`Direct fetch respondió: ${directRes.status}`, directRes.status === 404 ? 'warn' : 'error');
                if (directRes.status === 403) {
                    log('Sugerencia: El token podría necesitar autorización SSO para esta organización.', 'warn');
                }
            }
        }

        // STRATEGY 2: Search API (If direct fetch failed or keyword is a search term)
        if (items.length === 0) {
            log(`Iniciando búsqueda global vía API Search para "${keyword}"...`, 'info');
            const query = encodeURIComponent(`${keyword} repo:${owner}/${repoName}`);
            const response = await fetch(`https://api.github.com/search/code?q=${query}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 403 || response.status === 401) {
                log(`Error de API Search: ${response.status} (Probable problema de SSO o Límites)`, 'error');
            }

            if (response.ok) {
                const data = await response.json();
                items = data.items || [];
                log(`API Search devolvió ${items.length} resultados.`, items.length > 0 ? 'success' : 'warn');
            } else {
                log(`Error en API Search: ${response.status}`, 'error');
            }
        }

        // 2. Fetch raw contents for found items
        const fileResults = await Promise.all(items.slice(0, 5).map(async (item) => {
            log(`Descargando contenido RAW de: ${item.path}...`, 'info');
            try {
                const contentUrl = item.url;
                const contentRes = await fetch(contentUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                });
                if (!contentRes.ok) throw new Error(`HTTP ${contentRes.status}`);
                
                const rawContent = await contentRes.text();
                log(`✓ Contenido recibido (${item.path})`, 'success');
                return {
                    path: item.path,
                    content: rawContent
                };
            } catch (e) {
                log(`Error al descargar ${item.path}: ${e.message}`, 'error');
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
        log(`Error en proceso de repo: ${err.message}`, 'error');
        return {
            name: repo.url,
            status: 'error',
            message: err.message
        };
    }
}

function renderResult(res) {
    const div = document.createElement('div');
    div.className = 'repo-result';

    let content = `
        <div class="repo-result-header">
            <div>
                <span class="repo-name-tag">${res.name}</span>
                ${res.branch ? `<small style="margin-left:8px; color:var(--text-dim)">[Rama: ${res.branch}]</small>` : ''}
            </div>
            <span class="badge ${res.status === 'success' ? 'badge-success' : 'badge-error'}">
                ${res.status === 'success' ? `${res.count} Encontrados` : 'Error'}
            </span>
        </div>
    `;

    if (res.status === 'success') {
        if (res.count > 0) {
            content += `<div class="file-previews">`;
            res.files.forEach((f, idx) => {
                const url = `https://github.com/${res.name}/blob/${res.branch}/${f.path}`;
                const fileId = `file-${res.name.replace(/[^a-z0-9]/gi, '-')}-${idx}`;
                content += `
                    <div class="file-card">
                        <div class="file-header">
                            <a href="${url}" target="_blank" class="file-path">📄 ${f.path}</a>
                            <button class="btn btn-secondary btn-small" onclick="copyToClipboard('${fileId}')">Copiar</button>
                        </div>
                        <pre id="${fileId}" class="file-content-raw">${f.content ? escapeHtml(f.content) : (f.error || 'Sin contenido')}</pre>
                    </div>
                `;
            });
            content += `</div>`;
        } else {
            content += `<p style="font-size: 0.85rem; color: #64748b; margin-top: 10px;">No se encontraron resultados para "${keywordInput.value}".</p>`;
        }
    } else {
        let msg = res.message;
        if (msg.includes('403')) {
            msg = `<strong>Error 403 (Acceso Denegado):</strong> Tu Token parece no tener permisos para esta organización corporativa. <br><br>👉 Por favor, ve a la configuración de tu Token en GitHub y haz clic en <strong>"Configure SSO"</strong> para <strong>planetaformacion</strong>.`;
        }
        content += `<p style="color: #ef4444; font-size: 0.88rem; margin-top: 10px; border-left: 3px solid #ef4444; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 0 0.75rem 0.75rem 0;">${msg}</p>`;
    }

    div.innerHTML = content;
    resultsContainer.appendChild(div);
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
