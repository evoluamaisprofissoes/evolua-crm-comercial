# Evolua CRM Comercial

CRM comercial conectado ao Supabase para gestão de leads, atendimentos, tarefas, matrículas, recebimentos, metas e planejamento 5W2H.

## Versão 1.1

Esta atualização preserva os dados existentes e acrescenta:

- Edição e exclusão de leads, atendimentos, tarefas, matrículas, recebimentos, planejamento e ações 5W2H
- Edição, ativação, desativação e exclusão segura de cursos e origens
- Status de tarefa: pendente, em andamento, concluída e cancelada
- Reagendamento com registro do prazo anterior
- Lembretes internos e notificações do navegador
- Histórico automático de alterações das tarefas
- Indicadores de tarefas atrasadas e previstas para hoje
- Exportação do histórico de tarefas no Excel

## Atualização de uma instalação existente

1. No CRM atual, gere um backup em `Relatórios > Exportar JSON` ou Excel.
2. No Supabase, abra `SQL Editor`.
3. Execute somente o arquivo `database/ATUALIZACAO_V1_1.sql`.
4. Aguarde `Success. No rows returned`.
5. Envie todos os arquivos desta pasta para a raiz do repositório no GitHub, substituindo os anteriores.
6. Aguarde o GitHub Pages publicar e pressione `Ctrl + F5` no CRM.

**Não execute novamente o arquivo de instalação inicial do banco.**

## Lembretes

Na página `Agenda e follow-up`, clique em `Ativar lembretes` e autorize o navegador.

- As notificações funcionam enquanto o CRM estiver aberto em alguma aba.
- Os alertas internos de tarefas atrasadas aparecem mesmo sem essa permissão.
- Novas tarefas recebem, por padrão, um lembrete 15 minutos antes.
- Tarefas antigas continuam intactas e podem receber um lembrete ao serem editadas.

## Publicação manual no GitHub Pages

1. Envie todo o conteúdo desta pasta para a raiz do repositório.
2. Substitua os arquivos existentes quando solicitado.
3. O `index.html` deve permanecer diretamente na raiz.
4. Mantenha a pasta `.nojekyll`.
5. O GitHub Pages republicará a branch `main` automaticamente.

## Segurança

- Os registros continuam armazenados no Supabase.
- A atualização dos arquivos do GitHub não apaga o banco.
- A chave em `js/config.js` é uma Publishable Key própria para frontend.
- Nunca coloque uma Secret Key ou `service_role` no repositório.


## Versão 1.2

- Múltiplas metas no mesmo mês, vinculadas a cursos e produtos.
- Indicadores separados de vendas, receita gerada e faturamento recebido.
- Cadastro, edição e exclusão de metas comerciais.
- Novo fluxo financeiro para selecionar ou criar um lead, registrar matrícula, valor combinado e valor pago.
- Pesquisa de matrículas por aluno, lead ou curso.
- Antes da publicação, execute `database/ATUALIZACAO_V1_2.sql` no Supabase.


## Correção 1.2.1

- O lançamento financeiro recarrega os leads diretamente do Supabase ao abrir.
- A seleção de lead agora aparece como uma lista visível, com busca por nome, WhatsApp, telefone e e-mail.
- Inclui botão `Atualizar lista` e contador de leads encontrados.
- Não exige SQL novo e não altera os dados já cadastrados.
