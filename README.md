# GitHub PR File Filter

Extensão do Chrome que traz para a aba **Files changed** de um Pull Request do GitHub o comportamento do Code Review do Azure DevOps: clicar num arquivo da árvore mostra **só o diff daquele arquivo**, e clicar numa pasta mostra **só os arquivos daquela pasta**. Sem a extensão, o GitHub apenas rola a página até o arquivo.

## Recursos

- **Filtro por arquivo ou pasta:** clique num item da árvore lateral. A pasta inclui as subpastas.
- **Desligar o filtro:** clique de novo no mesmo item, aperte `Esc` ou use o botão **Mostrar todos** na barra do rodapé.
- **Comportamento original:** `Ctrl`/`Shift` + clique mantém o comportamento padrão do GitHub, que é rolar até o arquivo.
- **Arquivos expandidos ou colapsados:** no popup da extensão, escolha se cada arquivo abre só com os trechos alterados (padrão do GitHub) ou inteiro, com todas as linhas.

## Instalação

1. Clone este repositório.
2. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta do repositório.
4. Recarregue a página do PR.

## Limitações

- Feita para a nova experiência de *Files changed* do GitHub (rota `/pull/N/changes`).
- Depende da estrutura HTML do GitHub. Se o GitHub mudar os atributos usados (`role="treeitem"`, `div[role="region"][id^="diff-"]`, `button[data-file-path]`), a extensão precisa de ajuste.
- Clicar numa pasta também a abre ou fecha na árvore, porque o GitHub faz isso no mesmo clique.
