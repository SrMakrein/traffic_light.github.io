const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const chalk = require('chalk');

// Path for temporary repository storage
const TEMP_DIR = path.join(__dirname, '.temp_repos');

/**
 * Main execution function
 */
async function run() {
  console.log(chalk.cyan.bold('\n🚀 Iniciando Consulta de Repositorios GitHub...\n'));

  // 1. Load configuration
  let config;
  try {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
      console.error(chalk.red('❌ Error: No se encontró el archivo config.json'));
      process.exit(1);
    }
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(chalk.red('❌ Error al leer config.json:'), err.message);
    process.exit(1);
  }

  const { github_token, search_keyword, repositories } = config;

  if (!github_token || github_token === 'YOUR_GITHUB_TOKEN_HERE') {
    console.warn(chalk.yellow('⚠️  Atención: Debes configurar tu github_token en config.json'));
    process.exit(1);
  }

  // 2. Setup environment
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR);

  const git = simpleGit();

  // 3. Process each repository
  for (const repo of repositories) {
    const repoName = repo.url.split('/').pop().replace('.git', '');
    const localPath = path.join(TEMP_DIR, repoName);
    
    // Construct authenticated URL
    // Format: https://<token>@github.com/user/repo.git
    const authUrl = repo.url.replace('https://', `https://${github_token}@`);

    console.log(chalk.blue(`\n📂 Procesando: ${chalk.white.bold(repoName)} [Rama: ${repo.branch}]`));

    try {
      console.log(chalk.dim(`   Clonando rama '${repo.branch}'...`));
      await git.clone(authUrl, localPath, [
        '--depth', '1',
        '--branch', repo.branch,
        '--single-branch'
      ]);

      console.log(chalk.green(`   ✅ Clonado exitoso. Buscando "${search_keyword}"...`));
      
      const matches = searchInDirectory(localPath, search_keyword);
      
      if (matches.length > 0) {
        console.log(chalk.yellow(`   🔍 Encontrado en ${matches.length} archivos:`));
        matches.forEach(m => {
          const relativePath = path.relative(localPath, m);
          console.log(chalk.white(`      - ${relativePath}`));
        });
      } else {
        console.log(chalk.gray(`   ℹ️  No se encontraron coincidencias.`));
      }
    } catch (err) {
      console.error(chalk.red(`   ❌ Error con el repositorio ${repoName}:`), err.message);
    }
  }

  // 4. Cleanup (optional, keeping it simple for now)
  console.log(chalk.cyan.bold('\n✨ Tarea finalizada.\n'));
}

/**
 * Recursively search for a keyword in file names and content
 */
function searchInDirectory(dir, keyword) {
  let results = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (file !== '.git') {
        results = results.concat(searchInDirectory(fullPath, keyword));
      }
    } else {
      // Check content
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(keyword)) {
          results.push(fullPath);
        }
      } catch (err) {
        // Skip binary or unreadable files
      }
    }
  }
  return results;
}

run();
