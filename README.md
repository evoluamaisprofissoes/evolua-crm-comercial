# Evolua CRM Comercial

CRM estático conectado ao Supabase para gestão de leads, histórico de atendimentos, agenda, follow-ups, matrículas, recebimentos, metas e planejamento 5W2H.

## Recursos

- Login protegido pelo Supabase Auth
- Dashboard com indicadores e gráficos
- Cadastro e funil de leads
- Cursos de interesse e origens
- Histórico de atendimentos
- Agenda e follow-ups
- Matrículas e receita comercial gerada
- Recebimentos e faturamento efetivo
- Planejamento mensal e 5W2H
- Exportação Excel, PDF e JSON
- Layout responsivo para computador e celular

## Publicação manual no GitHub Pages

1. Envie **todo o conteúdo desta pasta** para a raiz do repositório.
2. No repositório, abra `Settings`.
3. Entre em `Pages`.
4. Em `Build and deployment`, selecione `Deploy from a branch`.
5. Selecione a branch `main` e a pasta `/(root)`.
6. Clique em `Save`.
7. Aguarde o endereço do site aparecer no mesmo painel.

## Primeiro acesso

Use o e-mail e a senha do usuário criado em `Supabase > Authentication > Users`.

## Configuração da conexão

A URL do projeto e a Publishable Key estão em:

`js/config.js`

A Publishable Key é própria para uso no navegador. Nunca coloque uma Secret Key ou `service_role` no repositório.

## Bibliotecas externas

O sistema carrega pelo CDN:

- Supabase JS
- Chart.js
- SheetJS
- jsPDF

Por isso, o navegador precisa de internet para abrir o CRM.

## Trocar identidade visual

- Cores: `css/styles.css`, variáveis no início do arquivo.
- Nome do sistema: `index.html` e `js/config.js`.
- Ícone: `assets/favicon.svg`.

## Observação

A pasta `.nojekyll` deve ser enviada ao GitHub. Ela impede que o GitHub Pages tente processar o projeto como um site Jekyll.
