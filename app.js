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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('App Initialized');
    loadConfig();
    if (reposContainer.children.length === 0) {
        addRepoRow();
    }
});

// Event Listeners
addRepoBtn.addEventListener('click', () => addRepoRow());
runSearchBtn.addEventListener('click', startSearch);

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

    try {
        console.log('Validating token...');
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (!userRes.ok) {
            throw new Error(`Token inválido o expirado (${userRes.status}). Verifica tus permisos.`);
        }
        const userData = await userRes.json();
        console.log('Authenticated as:', userData.login);

        const results = await Promise.all(repos.map(repo => queryRepo(repo, keyword, token)));
        
        results.forEach(res => renderResult(res));
        searchStatus.innerHTML = '<span style="color:var(--accent)">Completado</span>';
    } catch (err) {
        console.error('Search Error:', err);
        searchStatus.innerHTML = '<span style="color:#ef4444">Error Fatal</span>';
        resultsContainer.innerHTML = `<p style="padding:1rem; color:#ef4444; background:rgba(239,68,68,0.1); border-radius:1rem;">Error: ${err.message}</p>`;
    } finally {
        runSearchBtn.disabled = false;
        runSearchBtn.innerText = 'Iniciar Búsqueda Dinámica';
    }
}

async function queryRepo(repo, keyword, token) {
    console.log(`Querying repo: ${repo.url}`);
    try {
        // Robust owner/repo extraction
        let owner, repoName, urlBranch;
        
        // Remove trailing .git
        let cleanUrl = repo.url.replace(/\.git$/, '').replace(/\/$/, '');
        
        // Match standard github URLs
        const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?$/);
        
        if (match) {
            owner = match[1];
            repoName = match[2];
            urlBranch = match[3];
        } else if (cleanUrl.includes('/')) {
            const parts = cleanUrl.split('/').filter(p => p && p !== 'https:' && p !== 'github.com');
            owner = parts[0];
            repoName = parts[1];
        } else {
            throw new Error('Formato de URL o nombre de repo inválido');
        }

        const targetBranch = repo.branch || urlBranch || 'main';
        console.log(`Target: ${owner}/${repoName} branch: ${targetBranch}`);

        let items = [];
        let isDirectMatch = false;

        // STRATEGY 1: Direct Content Fetch (Reliable for specific files like config.json)
        if (keyword.includes('.') && !keyword.includes(' ')) {
            console.log(`Trying direct fetch for ${keyword}...`);
            const directUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${keyword.startsWith('/') ? keyword.substring(1) : keyword}?ref=${targetBranch}`;
            
            const directRes = await fetch(directUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (directRes.ok) {
                const item = await directRes.json();
                if (!Array.isArray(item)) {
                    console.log('Direct file match found!');
                    items = [item];
                    isDirectMatch = true;
                }
            } else if (directRes.status === 404) {
                console.warn(`File not found directly. Status: ${directRes.status}. This is normal if it doesn't exist at this exact path.`);
            } else {
                console.warn(`Direct fetch failed with status: ${directRes.status}`);
            }
        }

        // STRATEGY 2: Search API (If direct fetch failed or keyword is a search term)
        if (items.length === 0) {
            console.log(`Falling back to Search API for "${keyword}"...`);
            const query = encodeURIComponent(`${keyword} repo:${owner}/${repoName}`);
            const response = await fetch(`https://api.github.com/search/code?q=${query}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.status === 403 || response.status === 401) {
                throw new Error('Error de autenticación. Verifica si el token requiere autorización SSO para esta organización.');
            }

            if (response.ok) {
                const data = await response.json();
                items = data.items || [];
            }
        }

        // 2. Fetch raw contents for found items
        const fileResults = await Promise.all(items.slice(0, 5).map(async (item) => {
            try {
                // Use the same target branch for the raw content if it was a direct match
                const contentUrl = item.url;
                const contentRes = await fetch(contentUrl, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                });
                if (!contentRes.ok) throw new Error('No se pudo obtener el contenido RAW');
                
                const rawContent = await contentRes.text();
                return {
                    path: item.path,
                    content: rawContent
                };
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
        console.error(err);
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
            res.files.forEach(f => {
                const url = `https://github.com/${res.name}/blob/${res.branch}/${f.path}`;
                content += `
                    <div class="file-card">
                        <div class="file-header">
                            <a href="${url}" target="_blank" class="file-path">📄 ${f.path}</a>
                        </div>
                        <pre class="file-content-raw">${f.content ? escapeHtml(f.content) : (f.error || 'Sin contenido')}</pre>
                    </div>
                `;
            });
            content += `</div>`;
        } else {
            content += `<p style="font-size: 0.85rem; color: #64748b; margin-top: 10px;">No se encontraron resultados para "${keywordInput.value}".</p>`;
        }
    } else {
        content += `<p style="color: #ef4444; font-size: 0.85rem; margin-top: 10px; border-left: 2px solid #ef4444; padding-left: 10px;">${res.message}</p>`;
    }

    div.innerHTML = content;
    resultsContainer.appendChild(div);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
