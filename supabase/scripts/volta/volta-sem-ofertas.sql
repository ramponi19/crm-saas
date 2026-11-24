-- Volta da 20261124001900_sem_ofertas. Tira as funções e o gatilho. As colunas FICAM (guardam quem pediu para não
-- receber ofertas; apagar seria perder o pedido do cliente). Os passos já pulados continuam pulados.
drop trigger if exists posvenda_acompanhamentos_sem_ofertas on public.posvenda_acompanhamentos;
drop function if exists public.posvenda_sem_ofertas_no_passo();
drop function if exists public.contato_sem_ofertas(bigint, boolean);
drop function if exists public.core_sem_ofertas_pelo_botao(bigint);
drop function if exists public.core_sem_ofertas_aplicar(bigint, bigint, boolean, text);
drop function if exists public.core_sem_ofertas_confirmacao_padrao();
