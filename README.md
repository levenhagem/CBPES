# CBPES — Portal oficial

Site estático (HTML/CSS/JS) + Supabase (banco e login). Tudo no plano gratuito.

## Arquivos
- `index.html` + `portal.js` portal público · `admin.html` + `admin.js` administração (login) · `lib.js` cálculos · `schema.sql` banco completo · `atualizacao_v2.sql` só as novidades · `config.js` suas chaves.

## Passo a passo (uma vez só)
1. **Supabase** (supabase.com) → crie conta e um projeto novo (guarde a senha do banco).
2. Menu **SQL Editor** → New query → cole todo o `schema.sql` → **Run**.
   *(Se você já tinha rodado a versão anterior do schema, rode apenas o `atualizacao_v2.sql`.)*
3. Menu **Authentication → Users → Add user → Create new user**: seu e-mail e uma senha forte, marque **Auto Confirm User**.
   Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**.
4. No **SQL Editor**, torne-se administrador (troque pelo seu e-mail):
   `insert into admins select id from auth.users where email = 'seu@email.com';`
5. **Project Settings → API**: copie a *Project URL* e a chave *anon public* para o `config.js`.
6. **GitHub**: crie um repositório e envie estes arquivos. **Vercel** (vercel.com) → Add New Project → importe o repositório → Framework: *Other* → Deploy.
7. Acesse `seu-site.vercel.app/admin.html`, entre e siga a ordem:
   **Campeonato** (escolha o formato e salve) → **Times** (participantes e, dentro de cada um, os jogadores que fazem gol/assistência) → **Campeonato > Gerar calendário** → **Jogos** (rodadas, placares, datas, gols e confrontos numa tela só).

## Formatos disponíveis
Pontos corridos (turno único ou turno e returno) · Mata-mata (jogo único ou ida e volta, final opcional em jogo único, pênaltis) · Fase de grupos + mata-mata (nº de grupos, classificados por grupo, jogos de ida ou ida e volta). Pontos por vitória/empate são configuráveis. No mata-mata, use "Avançar fase" após definir todos os confrontos.

## Observações
- A classificação, as estatísticas e a última partida em destaque são calculadas sozinhas a cada resultado salvo; o portal também se atualiza a cada 1 minuto.
- Visitantes só leem dados. Qualquer escrita exige login de administrador (regras RLS no banco, não apenas no site).
- Todo cadastro, edição ou exclusão fica registrado na aba **Histórico**.
- O plano gratuito do Supabase pausa o projeto após ~7 dias sem nenhuma atividade; visitas ao portal contam como atividade, e um projeto pausado se reativa com um clique no painel.
- Para novos administradores: crie o usuário e repita o passo 4 com o e-mail dele.

## Atualizando o site depois
Suba os arquivos novos no GitHub (Add file > Upload files) e o Vercel republica sozinho. **Não substitua o seu `config.js` já preenchido.**
