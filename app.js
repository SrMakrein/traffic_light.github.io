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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
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
    runSearchBtn.disabled = true;
    runSearchBtn.innerHTML = '<div class="loading-spinner"></div> Buscando...';

    const results = await Promise.all(repos.map(repo => queryRepo(repo, keyword, token)));

    runSearchBtn.disabled = false;
    runSearchBtn.innerText = 'Iniciar Búsqueda Dinámica';

    results.forEach(res => renderResult(res));
}

async function queryRepo(repo, keyword, token) {
    try {
        // Extract owner and repo from URL
        // Expected: https://github.com/owner/repo
        const match = repo.url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) throw new Error('Formato de URL inválido');

        const owner = match[1];
        const repoName = match[2].replace('.git', '');

        // 1. Search for code matching the keyword
        // Using GitHub Code Search API
        // https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-code
        const query = encodeURIComponent(`${keyword} repo:${owner}/${repoName}`);
        const response = await fetch(`https://api.github.com/search/code?q=${query}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Error en la API de GitHub');
        }

        const data = await response.json();
        
        return {
            name: repoName,
            status: 'success',
            count: data.total_count,
            files: data.items.map(item => item.path)
        };

    } catch (err) {
        console.error(err);
        const repoName = repo.url.split('/').pop() || 'Repo';
        return {
            name: repoName,
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
            <span class="repo-name-tag">${res.name}</span>
            <span class="badge ${res.status === 'success' ? 'badge-success' : 'badge-error'}">
                ${res.status === 'success' ? `${res.count} Coincidencias` : 'Error'}
            </span>
        </div>
    `;

    if (res.status === 'success') {
        if (res.count > 0) {
            content += `<ul class="file-matches">`;
            res.files.forEach(f => content += `<li>${f}</li>`);
            content += `</ul>`;
        } else {
            content += `<p style="font-size: 0.85rem; color: #64748b;">No se encontraron resultados.</p>`;
        }
    } else {
        content += `<p style="color: #ef4444; font-size: 0.85rem;">${res.message}</p>`;
    }

    div.innerHTML = content;
    resultsContainer.appendChild(div);
}
