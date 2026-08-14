/**
 * Gera o "PIX copia e cola" (BR Code, padrão EMV do Banco Central) na hora,
 * já com o valor do rateio embutido — o QR estático do banco não carrega
 * valor, e o valor muda de partida pra partida.
 *
 * Validado byte a byte contra um código real gerado pelo Itaú (mesma chave,
 * nome e cidade, sem o campo de valor): o CRC16 calculado aqui bateu
 * exatamente com o do banco.
 */

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  const length = String(value.length).padStart(2, "0");
  return `${id}${length}${value}`;
}

// Faixa Unicode dos acentos combinantes (̀-ͯ), escrita como escape
// pra não depender de o terminal/editor preservar o caractere bruto.
const ACENTOS_COMBINANTES = /[̀-ͯ]/g;

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(ACENTOS_COMBINANTES, "");
}

/** Telefone sem "+55" vira E.164; outros tipos de chave (email, CPF, chave aleatória) seguem como estão. */
function normalizarChave(chave: string): string {
  const digitos = chave.replace(/\D/g, "");
  if (/^\d{10,11}$/.test(digitos)) return `+55${digitos}`;
  return chave.trim();
}

export type DadosPix = {
  chave: string;
  nome: string;
  cidade: string;
  /** Em reais. Omitido ou <= 0 gera um código sem valor pré-preenchido. */
  valor?: number | null;
};

export function gerarPixCopiaECola({ chave, nome, cidade, valor }: DadosPix): string {
  const chaveNormalizada = normalizarChave(chave);
  const nomeFormatado = semAcento(nome).toUpperCase().trim().slice(0, 25) || "RECEBEDOR";
  const cidadeFormatada = semAcento(cidade).toUpperCase().trim().slice(0, 15) || "BRASIL";

  const contaMerchant = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", chaveNormalizada);

  let payload = tlv("00", "01") + tlv("26", contaMerchant) + tlv("52", "0000") + tlv("53", "986");

  if (valor && valor > 0) {
    payload += tlv("54", valor.toFixed(2));
  }

  payload +=
    tlv("58", "BR") +
    tlv("59", nomeFormatado) +
    tlv("60", cidadeFormatada) +
    // "***" é o valor padrão do Banco Central pra "sem identificador específico".
    tlv("62", tlv("05", "***"));

  payload += "6304";
  return payload + crc16(payload);
}
