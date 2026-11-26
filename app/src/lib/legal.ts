// Termos de uso e Política de privacidade do Clipei Cut.
// Ao mudar o texto, troque a versão aqui e em supabase/functions/accept-terms.
export const TERMS_VERSION = "2026-11-26";

export type LegalDoc = { title: string; updated: string; sections: Array<{ h: string; p: string[] }> };

const EMPRESA = "Clipei Studio Digital";
const CONTATO = "WhatsApp +55 62 99868-9137";

export const TERMS: LegalDoc = {
  title: "Termos de uso",
  updated: "21 de novembro de 2026",
  sections: [
    {
      h: "1. Quem somos e o que é o Clipei Cut",
      p: [
        `O Clipei Cut é um aplicativo para Windows oferecido por ${EMPRESA} ("Clipei", "nós").`,
        "O aplicativo usa inteligência artificial para encontrar os melhores momentos de vídeos (lives, gameplays, podcasts) e gerar clipes curtos com legenda. O vídeo é processado no seu computador; apenas o áudio é enviado aos nossos servidores para transcrição e análise.",
        "Ao criar uma conta ou usar o aplicativo, você concorda com estes Termos e com a Política de privacidade. Se não concordar, não use o Clipei Cut.",
      ],
    },
    {
      h: "2. Conta",
      p: [
        "Você precisa ter 18 anos ou mais, ou autorização do seu responsável legal, para criar uma conta.",
        "Você é responsável por manter sua senha em segredo e por tudo o que for feito com a sua conta. Informe-nos imediatamente se suspeitar de uso indevido.",
        "Cada pessoa deve usar a própria conta. É proibido criar várias contas para obter vantagens, como horas de teste extras.",
      ],
    },
    {
      h: "3. Teste grátis",
      p: [
        "O plano Grátis oferece 1 (uma) hora de análise de vídeo como teste, concedida uma única vez por computador. Ela não renova.",
        "Clipes exportados no plano Grátis saem em 720p e com o selo \"Feito com Clipei Cut\". Podemos alterar as condições do plano Grátis a qualquer momento.",
      ],
    },
    {
      h: "4. Planos, pagamentos e renovação",
      p: [
        "Os planos pagos dão direito a um número de horas de análise por mês, conforme descrito no aplicativo no momento da compra. As horas do plano não acumulam de um mês para o outro. Horas avulsas não vencem.",
        "Os pagamentos são processados pela InfinitePay (CloudWalk). Assinaturas antigas no cartão continuam no Mercado Pago até serem canceladas. Não temos acesso aos dados completos do seu cartão.",
        "Os planos são pré-pagos (mensal ou anual): não há cobrança automática. Para continuar com o plano, renove pelo app antes do vencimento; o novo período soma ao que já existe.",
        "Assinaturas mensais no cartão renovam automaticamente até serem canceladas. Você pode cancelar a renovação a qualquer momento em Configurações; o plano continua ativo até o fim do período já pago.",
        "Pagamentos únicos (Pix, plano anual ou horas avulsas) valem pelo período ou quantidade contratada e não renovam sozinhos.",
        "Os preços podem mudar. Mudanças não afetam períodos já pagos e serão avisadas com antecedência para assinaturas ativas.",
      ],
    },
    {
      h: "5. Arrependimento e reembolso",
      p: [
        "Conforme o Código de Defesa do Consumidor (art. 49), você pode desistir da compra em até 7 (sete) dias a partir da contratação e receber o valor de volta. Para isso, fale com o nosso suporte.",
        "Após esse prazo, não há reembolso proporcional de períodos ou horas não utilizados, exceto quando a lei determinar ou em caso de falha nossa que impeça o uso do serviço.",
      ],
    },
    {
      h: "6. Uso permitido e direitos sobre o conteúdo",
      p: [
        "Use o Clipei Cut apenas com vídeos que sejam seus ou para os quais você tenha autorização. Você é o único responsável pelo conteúdo que processa e publica, inclusive por direitos autorais, de imagem e de terceiros.",
        "Os clipes gerados pertencem a você. Não reivindicamos direitos sobre os seus vídeos.",
        "É proibido: tentar burlar limites, travas ou pagamentos; copiar, modificar, descompilar ou revender o aplicativo; usar o serviço para conteúdo ilegal, de ódio, de exploração de menores ou que viole direitos de terceiros; sobrecarregar ou atacar nossos servidores.",
      ],
    },
    {
      h: "7. Inteligência artificial",
      p: [
        "As sugestões de clipes, títulos, legendas e hashtags são geradas automaticamente e podem conter erros. Revise o resultado antes de publicar.",
        "Não garantimos desempenho, visualizações ou resultados nas redes sociais.",
      ],
    },
    {
      h: "8. Disponibilidade e responsabilidade",
      p: [
        "Trabalhamos para manter o serviço funcionando, mas ele pode ter interrupções para manutenção, falhas de terceiros (como provedores de IA, internet ou meios de pagamento) ou motivos fora do nosso controle.",
        "Na máxima extensão permitida pela lei, nossa responsabilidade fica limitada ao valor pago por você nos últimos 3 (três) meses. Não respondemos por perda de arquivos no seu computador; mantenha cópias dos seus vídeos.",
      ],
    },
    {
      h: "9. Suspensão e encerramento",
      p: [
        "Podemos suspender ou encerrar contas que violem estes Termos, especialmente em casos de fraude ou abuso.",
        "Você pode excluir sua conta a qualquer momento em Configurações › Excluir minha conta.",
      ],
    },
    {
      h: "10. Alterações e foro",
      p: [
        "Podemos atualizar estes Termos. Quando a mudança for relevante, pediremos que você aceite a nova versão no aplicativo.",
        "Estes Termos seguem as leis do Brasil. Fica eleito o foro do domicílio do consumidor para resolver qualquer questão.",
        `Contato: ${CONTATO}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Política de privacidade",
  updated: "21 de novembro de 2026",
  sections: [
    {
      h: "1. Quem cuida dos seus dados",
      p: [
        `O controlador dos dados é ${EMPRESA}. Contato para assuntos de privacidade (encarregado/DPO): ${CONTATO}.`,
        "Esta Política explica quais dados o Clipei Cut usa, por que, com quem compartilha e quais são os seus direitos pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).",
      ],
    },
    {
      h: "2. Dados que coletamos",
      p: [
        "Conta: e-mail, senha (guardada de forma criptografada) e nome de exibição.",
        "Plano e uso: plano contratado, saldo e consumo de horas, datas de uso e registros de pagamento (valor, produto, data e identificador do pagamento). Os dados do cartão ficam com a empresa de pagamento (InfinitePay ou, em assinaturas antigas, Mercado Pago).",
        "Segurança contra fraude: um código do seu computador, gerado a partir da identificação do Windows e embaralhado (não é possível recuperar a identificação original), e um código embaralhado do seu endereço de internet (IP).",
        "Áudio dos vídeos: apenas o áudio é enviado para transcrição e análise. O áudio não é guardado por nós depois do processamento.",
        "Não coletamos o seu vídeo: ele é processado no seu computador. Transcrições, projetos e clipes ficam salvos apenas no seu PC.",
      ],
    },
    {
      h: "3. Para que usamos",
      p: [
        "Prestar o serviço (criar a conta, analisar o áudio, gerar sugestões e controlar horas) — base legal: execução de contrato.",
        "Processar pagamentos e cumprir obrigações fiscais e contábeis — base legal: execução de contrato e obrigação legal.",
        "Evitar fraudes e abusos, como várias contas para obter testes grátis — base legal: legítimo interesse.",
        "Atendimento e comunicações sobre a sua conta (por exemplo, códigos de confirmação e avisos de cobrança) — base legal: execução de contrato.",
      ],
    },
    {
      h: "4. Com quem compartilhamos",
      p: [
        "Supabase (banco de dados, login e servidores), Groq (transcrição do áudio), Anthropic (análise do texto e sugestões), InfinitePay/CloudWalk (pagamentos) e Mercado Pago (assinaturas antigas no cartão).",
        "Alguns desses fornecedores ficam fora do Brasil (por exemplo, nos Estados Unidos). Nesses casos, a transferência é feita para a execução do contrato com você e com fornecedores que adotam medidas de segurança compatíveis com a LGPD.",
        "Não vendemos os seus dados. Podemos compartilhar informações quando exigido por lei ou ordem judicial.",
      ],
    },
    {
      h: "5. Por quanto tempo guardamos",
      p: [
        "Dados da conta: enquanto a conta existir. Ao excluir a conta, apagamos os dados pessoais.",
        "Registros de pagamento: pelo prazo exigido pela legislação fiscal (em geral, 5 anos), sem vínculo com o seu e-mail depois da exclusão da conta.",
        "Código do computador usado no teste grátis: mantido mesmo após a exclusão da conta, sem vínculo com você, apenas para impedir que o teste seja usado de novo no mesmo computador.",
        "Áudio: descartado após o processamento.",
      ],
    },
    {
      h: "6. Seus direitos",
      p: [
        "Você pode pedir: confirmação e acesso aos seus dados, correção, anonimização, portabilidade, informação sobre compartilhamento, revisão de decisões automatizadas e exclusão.",
        "Você mesmo pode excluir sua conta em Configurações › Excluir minha conta. Para os demais pedidos, fale com o nosso contato de privacidade. Respondemos em até 15 dias.",
        "Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
    {
      h: "7. Segurança",
      p: [
        "Usamos conexão criptografada, controle de acesso por conta e chaves de serviço guardadas apenas nos servidores. Nenhum sistema é 100% seguro; se houver um incidente relevante, avisaremos você e a ANPD conforme a lei.",
      ],
    },
    {
      h: "8. Alterações",
      p: ["Podemos atualizar esta Política. Quando a mudança for relevante, pediremos que você aceite a nova versão no aplicativo."],
    },
  ],
};

/** Versão em texto simples (para copiar para o site). */
export function toPlainText(doc: LegalDoc): string {
  return [`${doc.title}`, `Última atualização: ${doc.updated}`, "", ...doc.sections.flatMap((s) => [s.h, ...s.p, ""])].join("\n");
}
