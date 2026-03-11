const STORAGE_KEY = 'gh_query_tool_config';
const STATUS_FILE_PATH = 'status.json';
const OWN_REPO = 'SrMakrein/traffic_light';
const REPO_FILTER_KEY = 'gh_query_tool_filter';

// UI Elements
const runSearchBtn = document.getElementById('run-search-btn');
const resultsPanel = document.getElementById('results-panel');
const resultsContainer = document.getElementById('results-container');
const tokenInput = document.getElementById('gh-token');
const keywordInput = document.getElementById('search-keyword');
const repoFilterInput = document.getElementById('repo-filter');
const envSelector = document.getElementById('env-selector');
const searchStatus = document.getElementById('search-status');
const debugLog = document.getElementById('debug-log');
const clearDebugBtn = document.getElementById('clear-debug-btn');
const matrixContainer = document.getElementById('matrix-container');
const matrixBody = document.getElementById('matrix-body');
const debugToggle = document.getElementById('debug-toggle');
const debugPanel = document.getElementById('debug-panel');

let sharedStatus = { blocked_repos: [] };
let statusFileSha = null;
let searchTimeout = null;

// 29 Repositories detected in screenshots
const REPO_LIST = [
    'core.sb.ege.fr', 'sb.core', 'core.sb.esd.com', 'core.sb.unie.es', 
    'core.sb.planetafp.es', 'core.sb.eaebarcelona.com', 'core.sb.universidadviu.com', 
    'core.sb.universitatcarlemany.com', 'core.sb.sportsmanagementschool.fr', 'core.sb.supdeluxe.com', 
    'core.sb.planetaformacion.com', 'core.sb.obsbusiness.school', 'core.sb.eslsca.ma', 
    'core.sb.ifp.es', 'core.sb.eslsca.fr', 'core.sb.eae.es', 'core.sb.edumed.ma', 
    'core.sb.edcparis.edu', 'core.sb.eaemadrid.com', 'core.sb.biu.us', 'core.sb.bch.com', 
    'api.captacion.leads', 'n2php', 'sbetl', 'pubsubscriber', 'sce-php', 
    'sb.development.core', 'sb.development.site', 'sb.eaemadrid.com'
];

const ENVIRONMENTS = [
    { id: 'qa', label: 'QA', branch: 'qa', class: 'env-qa' },
    { id: 'uat', label: 'UAT', branch: 'uat', class: 'env-uat' },
    { id: 'pro', label: 'PRO', branch: 'master', class: 'env-pro' }
];

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
    log('Monitor de Entornos Iniciado', 'system');
    loadConfig();
});

// Event Listeners
runSearchBtn.addEventListener('click', startSearch);
clearDebugBtn.addEventListener('click', () => {
    debugLog.innerHTML = '<p class="log-entry system">Consola limpiada</p>';
});

// Toggle Debug Panel
debugToggle.addEventListener('click', () => {
    debugPanel.classList.toggle('active');
});

// Reactive Search with Debounce
[repoFilterInput, envSelector, keywordInput].forEach(input => {
    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(startSearch, 800);
    });
});

// Save config on change
[tokenInput, keywordInput, repoFilterInput, envSelector].forEach(input => {
    input.addEventListener('change', saveConfig);
});

async function loadSharedStatus(token) {
    log('Sincronizando estados de bloqueo desde GitHub...', 'info');
    try {
        const res = await fetch(`https://api.github.com/repos/${OWN_REPO}/contents/${STATUS_FILE_PATH}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            statusFileSha = data.sha;
            const content = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
            sharedStatus = JSON.parse(content);
            log(`Estados cargados: ${sharedStatus.blocked_repos.length} bloqueos encontrados`, 'success');
        } else {
            log('No se pudo cargar status.json (¿Es la primera vez o no existe?)', 'warn');
        }
    } catch (e) {
        log(`Error al cargar estados: ${e.message}`, 'error');
    }
}

async function syncStatusWithGitHub(token) {
    log('Guardando cambios en el repositorio...', 'info');
    try {
        // Get newest SHA first
        const rawRes = await fetch(`https://api.github.com/repos/${OWN_REPO}/contents/${STATUS_FILE_PATH}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (rawRes.ok) {
            const rawData = await rawRes.json();
            statusFileSha = rawData.sha;
        }

        const content = JSON.stringify(sharedStatus, null, 2);
        const b64Content = btoa(unescape(encodeURIComponent(content)));

        const putRes = await fetch(`https://api.github.com/repos/${OWN_REPO}/contents/${STATUS_FILE_PATH}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'Update: Persistence Status (Traffic Light)',
                content: b64Content,
                sha: statusFileSha
            })
        });

        if (putRes.ok) {
            const putData = await putRes.json();
            statusFileSha = putData.content.sha;
            log('Sincronización completada con éxito', 'success');
        } else {
            throw new Error(`HTTP ${putRes.status}`);
        }
    } catch (e) {
        log(`Error de sincronización: ${e.message}`, 'error');
        alert('Error al guardar el estado en GitHub. ¿Tienes permisos de escritura en el repo?');
    }
}

function saveConfig() {
    const config = {
        token: tokenInput.value,
        keyword: keywordInput.value,
        filter: repoFilterInput.value,
        env: envSelector.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

function loadConfig() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const config = JSON.parse(saved);
        tokenInput.value = config.token || '';
        keywordInput.value = config.keyword || 'config.json';
        repoFilterInput.value = config.filter || '';
        envSelector.value = config.env || 'all';
    }
}

async function startSearch() {
    const token = tokenInput.value.trim();
    const keyword = keywordInput.value.trim();
    const filterText = repoFilterInput.value.trim().toLowerCase();
    const selectedEnv = envSelector.value;

    if (!token) {
        alert('Por favor, ingresa tu GitHub Token.');
        return;
    }

    saveConfig();
    
    resultsPanel.classList.remove('hidden');
    matrixContainer.classList.remove('hidden');
    resultsContainer.innerHTML = '';
    matrixBody.innerHTML = '';
    searchStatus.innerHTML = '<span style="color:var(--primary)">Escaneando...</span>';
    runSearchBtn.disabled = true;
    runSearchBtn.innerHTML = '<div class="loading-spinner"></div> Procesando...';

    // 1. Filter repos
    const filteredRepos = REPO_LIST.filter(name => name.toLowerCase().includes(filterText));
    // 2. Filter environments
    const environmentsToScan = selectedEnv === 'all' 
        ? ENVIRONMENTS 
        : ENVIRONMENTS.filter(e => e.id === selectedEnv);

    log(`Iniciando escaneo: ${filteredRepos.length} repositorios | ${environmentsToScan.length} entornos.`, 'system');

    try {
        log('Validando Token de GitHub...', 'info');
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userRes.ok) {
            log(`Error de Validación: ${userRes.status}`, 'error');
            throw new Error(`Token inválido o expirado (${userRes.status}).`);
        }
        const userData = await userRes.json();
        log(`Autorizado como: ${userData.login}`, 'success');

        // LOAD SHARED STATUS
        await loadSharedStatus(token);

        // Execute search for each environment of each repo
        for (const repoName of filteredRepos) {
            for (const env of environmentsToScan) {
                const repoObj = { 
                    url: `https://github.com/planetaformacion/${repoName}`, 
                    branch: env.branch,
                    envLabel: env.label,
                    envClass: env.class
                };
                const result = await queryRepo(repoObj, keyword, token);
                renderTableRow(result, repoObj);
            }
        }

        searchStatus.innerHTML = '<span style="color:var(--accent)">Completado</span>';
        log('Escaneo de monitor finalizado', 'success');
    } catch (err) {
        log(`Error: ${err.message}`, 'error');
        searchStatus.innerHTML = '<span style="color:#ef4444">Fallo de conexión</span>';
        resultsContainer.innerHTML = `<p style="padding:1rem; color:#ef4444; background:rgba(239,68,68,0.1); border-radius:1rem;">Error: ${err.message}</p>`;
    } finally {
        runSearchBtn.disabled = false;
        runSearchBtn.innerText = 'Iniciar Escaneo de Monitor';
    }
}

function renderTableRow(res, repoInfo) {
    const tr = document.createElement('tr');
    tr.id = `row-${res.name.replace(/[^a-z0-9]/gi, '-')}-${repoInfo.envLabel.toLowerCase()}`;
    
    // Check if initially blocked
    if (sharedStatus.blocked_repos.includes(tr.id)) {
        tr.classList.add('row-blocked');
    }

    let version = '---';
    if (res.status === 'success' && res.files && res.files.length > 0) {
        const content = res.files[0].content;
        try {
            // Priority: Parse as JSON and find "site-builder"
            const data = JSON.parse(content);
            version = data['site-builder'] || data['version'] || 'Found';
        } catch (e) {
            // Regex fallback if not valid JSON
            const match = content.match(/"site-builder"\s*:\s*"([^"]+)"/);
            version = match ? match[1] : (content.length > 20 ? 'Content Found' : content);
        }
    } else if (res.status === 'error' || res.count === 0) {
        version = res.status === 'error' ? 'Error' : 'Not Found';
    }

    tr.innerHTML = `
        <td><a href="${repoInfo.url}" target="_blank" class="repo-link">${res.name || repoInfo.url}</a></td>
        <td><span class="env-tag ${repoInfo.envClass}">${repoInfo.envLabel}</span></td>
        <td class="version-cell">${escapeHtml(version)}</td>
        <td>
            <button class="btn btn-secondary btn-small btn-block" onclick="toggleBlockRow('${tr.id}')">
                ${tr.classList.contains('row-blocked') ? 'Desbloquear' : 'Bloquear'}
            </button>
        </td>
    `;

    matrixBody.appendChild(tr);
}

async function toggleBlockRow(rowId) {
    const token = tokenInput.value.trim();
    if (!token) {
        alert('Necesitas el token para realizar cambios compartidos.');
        return;
    }

    const row = document.getElementById(rowId);
    row.classList.toggle('row-blocked');
    const btn = row.querySelector('.btn-block');
    const isBlocked = row.classList.contains('row-blocked');
    
    btn.innerText = isBlocked ? 'Desbloquear' : 'Bloquear';
    
    // Update local set
    if (isBlocked) {
        if (!sharedStatus.blocked_repos.includes(rowId)) {
            sharedStatus.blocked_repos.push(rowId);
        }
    } else {
        sharedStatus.blocked_repos = sharedStatus.blocked_repos.filter(id => id !== rowId);
    }

    // Sync to GitHub
    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '⌛';
    await syncStatusWithGitHub(token);
    btn.disabled = false;
    btn.innerHTML = isBlocked ? 'Desbloquear' : 'Bloquear';
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
                log(`Obteniendo contenido de: ${item.path}...`, 'info');
                
                // We try to use the most direct way: if the item already has 'content', use it.
                // Note: items from Search API don't have 'content', items from Contents API usually do.
                if (item.content && item.encoding === 'base64') {
                    log(`Decodificando contenido base64 de ${item.path}...`, 'success');
                    // Remove newlines and decode
                    const cleanBase64 = item.content.replace(/\s/g, '');
                    return { 
                        path: item.path, 
                        content: decodeURIComponent(escape(atob(cleanBase64))) 
                    };
                }

                // If no content, fetch it specifically with the RAW header
                const contentRes = await fetch(item.url, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                });
                
                if (!contentRes.ok) throw new Error(`HTTP ${contentRes.status}`);
                
                const responseText = await contentRes.text();
                
                // If the response is still a JSON (happens if the header is ignored), try to decode it
                try {
                    const json = JSON.parse(responseText);
                    if (json.content && json.encoding === 'base64') {
                        const cleanB64 = json.content.replace(/\s/g, '');
                        const decoded = decodeURIComponent(escape(atob(cleanB64)));
                        return { path: item.path, content: decoded };
                    }
                } catch (e) {
                    // Not JSON, use as raw text
                }

                return { path: item.path, content: responseText };
            } catch (e) {
                log(`Error en ${item.path}: ${e.message}`, 'error');
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
