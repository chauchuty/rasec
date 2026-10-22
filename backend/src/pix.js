// Payload estático "copia e cola" do BR Code (EMV® QRCPS-MPM) do Banco Central.
// QR gerado sem integração de resposta: o cliente apresenta o comprovante.
import { config } from './config.js';

function campo(id, valor) {
  return id + String(valor.length).padStart(2, '0') + valor;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) */
function crc16(texto) {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Monta o Pix "copia e cola" com valor da compra */
export function gerarPayloadPix(valor) {
  const recebedor = String(config.pix.recebedor).toUpperCase().slice(0, 25);
  const cidade = String(config.pix.cidade).toUpperCase().slice(0, 15);

  const conta = campo('00', 'BR.GOV.BCB.PIX') + campo('01', config.pix.chave);
  const base =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', recebedor) +
    campo('60', cidade) +
    campo('62', campo('05', '***'));

  const semCrc = base + '6304';
  return semCrc + crc16(semCrc);
}
