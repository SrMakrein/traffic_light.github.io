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
        // Extract owner and repo from URL
        // Handles formats like https://github.com/owner/repo or owner/repo
        let owner, repoName;
        const match = repo.url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        
        if (match) {
            owner = match[1];
            repoName = match[2].replace('.git', '');
        } else if (repo.url.includes('/')) {
            [owner, repoName] = repo.url.split('/');
        } else {
            throw new Error('Formato de URL o nombre de repo inválido');
        }

        console.log(`Consultando ${owner}/${repoName} en rama ${repo.branch}...`);

        // IMPORTANT NOTE: The GitHub Search API (search/code) searches the DEFAULT branch.
        // To search specific branches in corporate/private repos, we often need to 
        // list trees or use the search API and then verify the branch.
        // For now, we'll perform a broad search and filter/annotate results.
        
        const query = encodeURIComponent(`${keyword} repo:${owner}/${repoName}`);
        const response = await fetch(`https://api.github.com/search/code?q=${query}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 422) {
            throw new Error('La búsqueda falló (posiblemente el repo no está indexado o el query es inválido)');
        }

        if (response.status === 404) {
            throw new Error('Repositorio no encontrado o sin permisos (verifica tu Token corporativo)');
        }

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Error en la API de GitHub');
        }

        const data = await response.json();
        let items = data.items;

        // FALLBACK: If search finds nothing and the keyword looks like a filename (e.g., config.json)
        // or just to be sure we check the target branch directly.
        if (items.length === 0 && (keyword.includes('.') || keyword.startsWith('/'))) {
            try {
                const directUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${keyword}?ref=${repo.branch}`;
                const directRes = await fetch(directUrl, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                if (directRes.ok) {
                    const item = await directRes.json();
                    if (!Array.isArray(item)) { // It's a single file
                        items = [{
                            path: item.path,
                            url: item.url,
                            html_url: item.html_url
                        }];
                    }
                }
            } catch (e) { console.warn("Fallback direct fetch failed", e); }
        }
        
        // 2. Fetch raw contents for found items
        const fileResults = await Promise.all(items.slice(0, 5).map(async (item) => {
            try {
                // Get raw content using the contents API
                const contentRes = await fetch(item.url, {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                });
                const rawContent = await contentRes.text();
                return {
                    path: item.path,
                    content: rawContent
                };
            } catch (e) {
                return { path: item.path, error: 'No se pudo obtener el contenido' };
            }
        }));
        
        return {
            name: `${owner}/${repoName}`,
            branch: repo.branch,
            status: 'success',
            count: data.total_count,
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
                ${res.branch ? `<small style="margin-left:8px; color:var(--text-dim)">[Resultados API Search / Target: ${res.branch}]</small>` : ''}
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
                const url = `https://github.com/${res.name}/blob/${res.branch || 'main'}/${f.path}`;
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
            content += `<p style="font-size: 0.85rem; color: #64748b;">No se encontraron resultados.</p>`;
        }
    } else {
        content += `<p style="color: #ef4444; font-size: 0.85rem;">${res.message}</p>`;
    }

    div.innerHTML = content;
    resultsContainer.appendChild(div);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
