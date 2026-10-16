# 🧭 Meu Roteiro

Planejador de viagens pessoal com:
- voos, hospedagens e aluguel de carro;
- roteiro dia a dia no mapa, com rotas e distâncias;
- controle dos gastos durante a viagem, comparando o previsto com o gasto.

Funciona no navegador do computador e pode ser instalado no celular como app (PWA).

Não tem dependências nem etapa de build: é HTML/CSS/JavaScript puro com algumas funções serverless na pasta `api/`. **Não precisa de cartão de crédito em nenhum serviço.**

---

## O que ele faz

| Aba | Para quê |
|---|---|
| **Roteiro** | Adicione restaurantes, passeios e atrações buscando pelo nome/endereço ou tocando no mapa. Distribua os lugares pelos dias, defina horários e custos previstos. Cada dia aparece no mapa com uma cor e a rota hotel → paradas → hotel, com o tempo de deslocamento entre as paradas. |
| **Gastos** | Lance o que você gastou em segundos: digite o valor, toque na categoria e dê Enter. O campo volta pronto para o próximo lançamento. O app abre direto no dia de hoje e mostra o gasto do dia contra o previsto. |
| **Reservas** | Dados da viagem e orçamento diário, voos (com endereço dos aeroportos), hospedagens e **aluguel de carro** no formato do voucher. |
| **Resumo** | Previsto × gasto por categoria e por dia, quanto falta, km percorridos. |

### Voos e aeroportos
Cada voo aparece como um cartão de embarque. Em "Editar voo", informe:
- o endereço dos aeroportos de partida e de chegada (🔎 busca, 📍 marca no mapa);
- se quiser, o trecho (ida, volta ou entre cidades).

Com os dois aeroportos no mapa, o app calcula a **distância de avião** em linha reta e desenha o arco do voo. Ela fica separada dos km por terra e **nunca entra no carro**. No dia da chegada, a rota começa no aeroporto; no dia da volta, termina nele.

### Pacotes de reservas e cenários
**Pacotes (aba Reservas):** voos, hospedagens e carro ficam dentro de um **pacote**.
- Em **＋ Novo pacote**, copie o pacote atual (e troque só o que muda) ou comece vazio. Dê um nome, como "Econômico" ou "Conforto".
- Toque num pacote para torná-lo o **vigente**. Tudo troca de uma vez: o que existe em um pacote não aparece no outro.
- Cada pacote mostra o total das reservas e a diferença em relação ao vigente. Use ✎ para renomear e ✕ para excluir.
- Roteiro, refeições e gastos são os mesmos em todos os pacotes.

**Alternativas de passeio (aba Roteiro):** no cartão do passeio, toque em **⇄ Alternativa** e busque outro lugar. As alternativas aparecem abaixo do passeio; toque em **Usar** para trocar. Só a escolhida entra no roteiro, nas rotas e nos custos.

**Cenários (aba Resumo):** **＋ Salvar escolhas atuais** guarda o pacote vigente, os passeios escolhidos e os restaurantes escolhidos.
- Os cenários aparecem lado a lado, com o total e a diferença para as escolhas atuais.
- **Aplicar** volta tudo de uma vez.
- Ao excluir um pacote, os cenários que dependiam dele também saem.

### Celular: mapa em todas as abas
- No celular, o mapa aparece no topo de todas as abas (Roteiro, Gastos, Reservas e Resumo).
- **⤢ Só o mapa** esconde os cadastros e deixa o mapa em tela cheia; **☰ Mostrar cadastros** volta.
- **▴ Esconder mapa** tira o mapa de todas as abas (útil para lançar gastos rápido); **🗺️ Mostrar mapa** traz de volta. A escolha fica salva no aparelho.

### Cancelar ou excluir uma viagem
- **Na tela inicial:** toque em ⋯ no cartão da viagem.
- **Dentro da viagem:** use a aba Reservas → **Gerenciar viagem**.

| Ação | O que acontece |
|---|---|
| **Cancelar** | A viagem sai da lista principal e vai para a aba **Canceladas**, com tudo guardado. Dá para abrir e **reativar** quando quiser. |
| **Excluir** | Apaga a viagem com reservas, roteiro e gastos, também da nuvem. Não dá para desfazer; exporte um backup antes se quiser guardar uma cópia. |

### Refeições (almoço e jantar)
Na visão de cada dia, o bloco **Refeições** mostra:
- ☕ **Café da manhã:** sempre no hotel do dia.
- 🍽️ **Almoço** e 🌙 **Jantar:** toque em "＋ Opção" para adicionar quantos restaurantes quiser. Cada opção tem:
  - custo **por pessoa** (o app multiplica pelo número de pessoas);
  - **faixa de preço**: $ barato, $$ médio, $$$ caro;
  - **estilo**: à la carte, rodízio, por quilo, buffet, lanche, petiscos/bar, barraca de praia, café/doceria.
- Marque a opção escolhida no círculo. **Só a escolhida entra no roteiro e na rota do dia**, encaixada pelo horário (padrão 12h30 no almoço, 20h no jantar). As outras ficam guardadas como alternativas.

Previsto de cada refeição:
- com restaurante escolhido: o custo dele;
- só com opções: a média das opções;
- sem nada: o orçamento por pessoa de almoço/jantar (Reservas → Orçamento diário).

### Passeios
Cada passeio tem **duração esperada** (30 min até o dia inteiro). O dia mostra o tempo em passeios mais o tempo de deslocamento.

**Atrações do passeio:** no cartão do passeio, toque em **🎟️ Atrações** para abrir a lista com o nome e o preço por pessoa de cada atração (preço vazio = não sei; 0 = grátis). Toque na **⭐** nas que mais te interessam. O modal mostra a soma das ⭐ por pessoa e para o grupo, e o botão **Usar ⭐ como custo do passeio** coloca essa soma no custo.
No cartão, as ⭐ viram um **checklist recolhido** ("⭐ Quero ver 1/3"): toque para abrir e marque o que já visitou.

**Local e trajeto das atrações:** no modal, cada atração é uma linha com ⭐, nome, modo, local e preço. Toque nela para editar (uma por vez):
- **🔎 Buscar local** (procura pelo nome perto do passeio e mostra até 5 resultados com a distância) ou **📍 Marcar no mapa** (o modal fecha, você toca no mapa e ele reabre).
- **Como chegar** até ela, vindo da anterior: 🚶 A pé, 🚲 Bike, 🚗 Carro ou 🚐 Táxi/app. O padrão é a pé.

Com atrações cadastradas, o cartão do passeio mostra **🎟️ N atrações · ⭐ · 📏 km · tempo** (quando o trajeto já foi calculado). Ao tocar, abre os **Detalhes** do passeio:
- O trajeto começa na **entrada do passeio** e passa pelas atrações localizadas na ordem da lista: só as ⭐ (se houver) ou **Todas**.
- Cada trecho mostra o modo, o tempo e os **km**. No topo ficam o total de km e de deslocamento e os km por modo.
- O mapa mostra só o passeio, as atrações numeradas (⭐ em amarelo) e as rotas entre elas, e cada atração tem 🧭 para navegar até ela.
- Esses km ficam só nos detalhes. Eles não entram no total de km nem no combustível da viagem.

### Modo "Hoje" (durante a viagem)
Nos dias da viagem, o Roteiro já abre no **dia de hoje** com um cartão de destaque:
- **Próxima parada**, com horário, duração e o tempo de deslocamento até lá.
- **🧭 Ir com Google Maps** (e **Waze** nos trechos de carro): abre a navegação já no modo do trecho (a pé, bike ou carro).
- **✓ Feito**: marca a parada como concluída e passa para a próxima. A lista do dia mostra o que já foi feito.
- **Gasto hoje × previsto do dia**, com atalho para lançar um gasto.

### Previsão do tempo
Cada dia mostra ícone, máxima/mínima e chance de chuva (quando passa de 10%) para o local do hotel daquela noite (ou o destino). Aparece no cartão Hoje, no topo do dia, nos cartões da visão geral e no Resumo.
- Vem do **Open-Meteo**: grátis e sem cadastro. O navegador consulta direto, sem passar pelo servidor.
- A previsão cobre até **16 dias à frente**. Dias mais distantes ficam sem previsão até a data chegar perto.
- Fica guardada no aparelho por 3 horas (uma consulta por local).

### Resumo: Passeios e Restaurantes
No Resumo há três abas: **Custos** (o resumo de antes), **Passeios** e **Restaurantes**.
- **Passeios:** todos os passeios do roteiro por dia, com horário, duração, custo e atrações ⭐. No topo, a quantidade, as horas totais e o custo previsto.
- **Restaurantes:** só os que **entraram no roteiro** (as opções escolhidas de almoço/jantar e os restaurantes adicionados direto em um dia), com refeição, faixa de preço, estilo e custo. No topo, o total e a média por pessoa por refeição.
- Nessas duas abas o **mapa mostra só esses lugares**, numerados como na lista e sem rotas, para dar destaque.
- **Ver no dia** leva para o dia do lugar no Roteiro. A aba escolhida fica lembrada.

### Como chegar em cada parada (trecho a trecho)
Entre uma parada e outra, na visão do dia, há um seletor **Como chegar**: **Auto**, 🚶 A pé, 🚲 Bike, 🚗 Carro (alugado, nos dias com carro, ou carro/app) e 🚐 Táxi/traslado.
- **Auto** segue a regra do dia: carro alugado entre a retirada e a devolução, traslado de/para o aeroporto, e o "Deslocamento" da viagem nos dias sem carro.
- Escolher outro modo vale só para aquele trecho (fica destacado). A rota, o tempo, o mapa e os km mudam na hora. **Trechos a pé ou de bike não entram no combustível do carro.**
- Também dá para escolher o modo da volta ao hotel e da ida até a retirada ou a devolução do carro.

### Rotas sem estourar a cota
- Cada trecho é consultado **uma vez** e fica guardado no aparelho. Abrir o app, trocar de aba ou de pacote não consulta de novo. O app só consulta quando as paradas do dia mudam.
- As consultas novas esperam 1,5 s depois da última edição (várias mudanças seguidas viram uma só) e saem uma por vez.
- **🔁 Rotas automáticas** (aba Roteiro): desligue para só consultar quando tocar em **Calcular rotas (N dias)**. As rotas já salvas continuam aparecendo.
- Se o OpenRouteService esgotar a cota, o app usa o **OSRM público da FOSSGIS** (grátis, sem chave). Se os dois falharem, mostra a estimativa em linha reta. A estimativa não fica salva, e "Calcular rotas" tenta de novo.

### Modo km
O botão **📏 Modo km** no Roteiro mostra a distância entre cada etapa do dia:
- na lista, a distância de cada trecho em destaque e o **odômetro** (km acumulados) em cada parada;
- no mapa do dia, um rótulo de km no meio de cada trecho;
- na visão de todos os dias, as etapas com os km entre elas.

A escolha fica salva no aparelho.

### Quilometragem por tipo de trecho
Cada trecho do dia tem um tipo, mostrado na lista do dia e no Resumo:

| Tipo | Quando |
|---|---|
| ✈️ Avião | Voos (distância entre os aeroportos) |
| 🚗 Carro alugado | Trechos depois da retirada e antes da devolução |
| 🚐 Táxi/traslado | Trechos de/para aeroporto sem o carro (ex.: aeroporto → locadora) |
| 🚶 A pé / 🚲 bike | Demais trechos, conforme o modo escolhido no Roteiro |

O Resumo mostra o total geral, os km de avião e os km por terra separados. **Só os km de carro alugado (mais os km fora do roteiro) entram no combustível.**

No mapa, os botões **Avião / Carro / A pé-bike** mostram ou escondem cada tipo de rota. Cada tipo tem um traço próprio: avião tracejado escuro, carro contínuo, traslado tracejado, a pé pontilhado.

### Carro alugado
O cadastro segue o formato do voucher das locadoras:
- **Retirada e devolução:** data/hora e endereço (aeroporto, loja). Há um botão para devolver no mesmo local.
- **Retiro logo após desembarcar:** a rota do dia da chegada vai aeroporto → locadora (traslado) → resto do dia de carro. Sem endereço de retirada, a locadora é considerada no próprio aeroporto.
- **Devolvo e sigo direto para o aeroporto:** no dia da volta, a devolução é a última parada antes do embarque (locadora → aeroporto = traslado). Desmarcado, a devolução acontece no horário informado e o restante do dia é sem carro.
- As duas opções vêm marcadas automaticamente quando a retirada ou a devolução cai no mesmo dia de um voo, e você pode mudar.
- **Valores da reserva:**
  - nº de diárias (calculado pelas datas, com 1 h de tolerância) × valor da diária;
  - pacote de proteção por dia (ex.: "Pacote Completo");
  - adicionais de valor único ou por diária (ex.: limpeza, cadeirinha, condutor adicional);
  - **taxa de aluguel em %** sobre a soma de tudo, como os 15% das locadoras;
  - franquia de km por dia e valor do km excedente.
- **Gastos durante a viagem:** consumo (km/l), preço do litro, estacionamento por dia, pedágios e km fora do roteiro.

Exemplo, com os valores de um voucher real:
- 7 × R$ 81,95 = R$ 573,65
- \+ 7 × R$ 78,02 = R$ 546,14
- \+ limpeza = R$ 49,95
- \+ taxa de 15% = R$ 175,46
- **Total: R$ 1.345,20**

Nos dias com carro:
- os trechos com o carro em mãos são calculados de carro; os trechos até a locadora e depois da devolução contam como traslado;
- o combustível é estimado por km ÷ consumo × preço do litro;
- o transporte local diário não é cobrado.

**Cada km entra uma vez só no combustível:** km das rotas do roteiro + km fora do roteiro. Use "km fora do roteiro" apenas para trajetos que *não* estão cadastrados como lugares.

### Como os custos são calculados
- **Previsto:**
  - voos, hospedagem e aluguel do carro (valores das reservas);
  - alimentação por dia;
  - transporte local por dia (só nos dias sem carro);
  - custos dos lugares do roteiro;
  - combustível, estacionamento e pedágios;
  - orçamento de compras.
- **Gasto:** voos, hospedagem e aluguel do carro contam como já pagos. O restante vem dos lançamentos da aba Gastos.

Outros recursos:
- Seletor de tema (automático, claro ou escuro): no ícone do topo de qualquer tela ou em Configuração. A escolha fica salva no aparelho.
- Botão de olho no login para mostrar a senha enquanto digita.
- Funciona sem internet. Você pode lançar gastos no meio do passeio, e eles sincronizam quando a conexão volta.
- Tem tema escuro automático.
- Permite exportar e importar backup.

---

## Serviços usados (todos gratuitos, sem cartão)

| Serviço | Para quê | Precisa de conta? |
|---|---|---|
| Vercel (Hobby) | Hospedar o site e as funções | Sim (grátis) |
| OpenStreetMap (Nominatim/Photon) | Buscar endereços e lugares pelo nome | Não |
| OpenStreetMap | Imagens do mapa | Não |
| OpenRouteService | Rotas reais a pé, de carro e de bicicleta (2.000/dia) | Sim (grátis), **opcional** |
| Open-Meteo | Previsão do tempo por dia (até 16 dias) | Não |
| OSRM da FOSSGIS (routing.openstreetmap.de) | Rotas de reserva quando o ORS falha ou não está configurado (uso leve, 1 consulta/s) | Não |
| Supabase | Sincronizar computador ↔ celular | Sim (grátis), **opcional** |

Só a senha (`APP_PASSWORD`) é obrigatória.
- **Sem o OpenRouteService:** as rotas vêm do OSRM público da FOSSGIS. Se ele também falhar, as distâncias são estimadas em linha reta, com uma correção de ~30–40%.
- **Sem o Supabase:** os dados ficam só no navegador onde você os criou.

---

## Passo a passo do deploy

### 1. Coloque o código no GitHub
1. Crie uma conta em <https://github.com> (se ainda não tiver).
2. Crie um repositório **privado** (ex.: `meu-roteiro`).
3. Na página do repositório vazio, clique em **"uploading an existing file"** e arraste todo o conteúdo da pasta `roteiro/`.

### 2. Publique na Vercel
1. Entre em <https://vercel.com> com sua conta do GitHub.
2. Clique em **Add New → Project**, escolha o repositório e clique em **Import**.
3. Em *Framework Preset*, escolha **Other**. Deixe *Build Command* e *Output Directory* vazios.
4. Em **Environment Variables**, cadastre `APP_PASSWORD` com uma senha forte.
5. Clique em **Deploy**. Você recebe um endereço `https://seu-projeto.vercel.app`.

Sempre que adicionar ou alterar uma variável, faça um novo deploy: aba **Deployments**, menu **⋯** do último deploy e depois **Redeploy**.

### 3. (Opcional) Rotas reais – OpenRouteService
1. Cadastre-se em <https://openrouteservice.org/dev/#/signup>.
2. No painel, crie um token (plano *Standard*, gratuito).
3. Cadastre a variável `ORS_API_KEY` na Vercel.
4. (Opcional) `ROUTE_PROVIDER`: `osrm` usa só o OSRM (pula o ORS), `ors` usa só o ORS e `estimate` não consulta nenhum serviço. Vazio = ORS → OSRM → estimativa.

### 4. (Opcional) Sincronizar entre aparelhos – Supabase
1. Crie um projeto gratuito em <https://supabase.com>.
2. Abra **SQL Editor → New query**, cole o conteúdo de `supabase.sql` e clique em **Run**.
3. Em **Project Settings → API Keys** (ou **Data API**), copie:
   - a **URL do projeto** e cadastre como `SUPABASE_URL`;
   - a chave **secret** (ou *service_role*) e cadastre como `SUPABASE_SERVICE_KEY`.
     - Essa chave fica só no servidor.
4. Faça o redeploy. Na primeira vez que abrir o app, o que já estiver no navegador é enviado para a nuvem.

> O plano gratuito do Supabase pausa projetos parados por 7 dias. O arquivo `vercel.json` já agenda uma chamada diária que mantém o projeto ativo.

### 5. (Opcional) E-mail para a busca de endereços
A política do OpenStreetMap pede que aplicações se identifiquem. Cadastre seu e-mail em `GEOCODER_EMAIL`. Funciona sem ele, mas é uma boa prática.

### 6. Instale no celular
- **Android (Chrome):** abra o endereço, toque no menu **⋮** e depois em **Instalar app** (ou *Adicionar à tela inicial*).
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.

---

## Testar no seu computador

É preciso ter o Node.js 20 ou superior. Não é necessário rodar `npm install`.

```bash
cp .env.example .env        # preencha pelo menos APP_PASSWORD
node dev-server.mjs         # abre em http://localhost:3000
```

---

## Fluxo de uso sugerido

**Antes da viagem**
1. Crie a viagem com o destino e as datas.
2. Em **Reservas**:
   - preencha o orçamento diário (alimentação e transporte);
   - cadastre os voos e as hospedagens. Em cada hotel, use 🔎 *Buscar endereço* ou 📍 *Marcar no mapa*;
   - cadastre o carro alugado.
3. Em **Roteiro**, toque em **＋ Lugar** para cada restaurante ou passeio:
   - busque pelo nome ou marque no mapa;
   - escolha o dia e o custo previsto.
4. Ajuste a ordem com ↑↓ e confira as distâncias de cada dia.

**Durante a viagem**
1. Abra **Gastos**. O app já abre no dia de hoje.
2. Digite o valor, toque na categoria e dê Enter. Leva uns 3 segundos.
3. Acompanhe no **Resumo** quanto já foi e quanto falta.

---

## Estrutura do projeto

```
index.html            página única do app
css/app.css           estilos (claro/escuro, celular/desktop)
js/app.js             telas e interações
js/util.js            regras: dias, carro, custos previsto × gasto
js/store.js           salvar/carregar (nuvem + navegador + offline)
js/api.js             chamadas às funções do servidor
js/map.js             mapa (Leaflet) e "marcar no mapa"
api/geocode.js        busca de endereços (OpenStreetMap)
api/route.js          rotas: OpenRouteService → OSRM (FOSSGIS) → estimativa
api/data.js           Supabase (salvar/carregar)
api/keepalive.js      evita a pausa do Supabase
api/status.js         valida a senha e lista recursos ativos
vendor/leaflet/       biblioteca do mapa
sw.js, manifest       PWA (instalação e uso offline)
dev-server.mjs        servidor local para testes
supabase.sql          tabela do banco
```

## Limitações desta versão
- Uma única moeda por viagem (sem conversão automática).
- A busca de endereços do OpenStreetMap é boa para endereços e pontos turísticos conhecidos, mas encontra menos restaurantes pequenos que o Google. Nesses casos, use *Marcar no mapa*.
- Se você editar a mesma viagem em dois aparelhos ao mesmo tempo, a última gravação vence.

## Ideias para próximas versões
- Converter moedas automaticamente nos gastos.
- Mostrar o gasto por pessoa e quem pagou (dividir a conta).
- Anexar a foto do comprovante a cada gasto.
- Trazer de volta, como opções, o Google Places e a IA.
