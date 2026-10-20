/* Gerador de QR Code em JavaScript puro, sem bibliotecas.
   Suporta texto em modo byte, correção de erro nível M e versões 1 a 6 (até 106 bytes),
   o suficiente para o código Pix de teste do checkout. */
window.FHPQR = (() => {
  // Por versão: total de codewords, codewords de correção por bloco, nº de blocos,
  // centro do padrão de alinhamento (0 = não tem).
  const VERSIONS = [
    null,
    [26, 10, 1, 0],
    [44, 16, 1, 18],
    [70, 26, 1, 22],
    [100, 18, 2, 26],
    [134, 24, 2, 30],
    [172, 16, 4, 34]
  ];

  // Aritmética no corpo GF(256), usada pela correção de erro Reed-Solomon.
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const multiply = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  const generatorPolynomial = degree => {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      poly.forEach((coefficient, j) => {
        next[j] ^= coefficient;
        next[j + 1] ^= multiply(coefficient, EXP[i]);
      });
      poly = next;
    }
    return poly;
  };

  const errorCorrection = (data, degree) => {
    const generator = generatorPolynomial(degree);
    const result = new Array(degree).fill(0);
    data.forEach(byte => {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < degree; i++) result[i] ^= multiply(generator[i + 1], factor);
    });
    return result;
  };

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
  ];

  // Devolve a matriz de módulos (true = escuro).
  const encode = text => {
    const bytes = [...new TextEncoder().encode(text)];
    const version = VERSIONS.findIndex((spec, index) => index && bytes.length <= spec[0] - spec[1] * spec[2] - 2);
    if (version < 0) throw Error('Texto longo demais para o QR Code.');
    const [total, ecLength, blockCount, alignment] = VERSIONS[version];
    const dataLength = total - ecLength * blockCount;

    // 1. Dados: indicador de modo byte, tamanho, bytes, terminador e preenchimento.
    const bits = [];
    const push = (value, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    push(4, 4);
    push(bytes.length, 8);
    bytes.forEach(byte => push(byte, 8));
    push(0, Math.min(4, dataLength * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < dataLength; pad ^= 0xec ^ 0x11) data.push(pad);

    // 2. Correção de erro por bloco e intercalação.
    const blockSize = dataLength / blockCount;
    const dataBlocks = [];
    const ecBlocks = [];
    for (let b = 0; b < blockCount; b++) {
      const block = data.slice(b * blockSize, (b + 1) * blockSize);
      dataBlocks.push(block);
      ecBlocks.push(errorCorrection(block, ecLength));
    }
    const codewords = [];
    for (let i = 0; i < blockSize; i++) dataBlocks.forEach(block => codewords.push(block[i]));
    for (let i = 0; i < ecLength; i++) ecBlocks.forEach(block => codewords.push(block[i]));

    // 3. Padrões fixos: localizadores, sincronismo, alinhamento e áreas de formato.
    const size = 17 + 4 * version;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => {
      modules[y][x] = dark;
      reserved[y][x] = true;
    };
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, distance !== 2 && distance !== 4);
        }
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    for (let i = 8; i < size - 8; i++) {
      set(i, 6, i % 2 === 0);
      set(6, i, i % 2 === 0);
    }
    if (alignment) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(alignment + dx, alignment + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    for (let i = 0; i < 9; i++) {
      if (!reserved[8][i]) set(i, 8, false);
      if (!reserved[i][8]) set(8, i, false);
    }
    for (let i = 0; i < 8; i++) {
      set(size - 1 - i, 8, false);
      set(8, size - 1 - i, false);
    }
    set(8, size - 8, true);

    // 4. Dados em zigue-zague, de baixo para cima, a partir do canto inferior direito.
    let bit = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vertical : vertical;
          if (reserved[y][x] || bit >= codewords.length * 8) continue;
          modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
      }
    }

    // 5. Máscara e bits de formato (nível M + máscara, com código BCH).
    const applyMask = mask => {
      const grid = modules.map(row => row.slice());
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (!reserved[y][x] && MASKS[mask](x, y)) grid[y][x] = !grid[y][x];
        }
      }
      let remainder = mask;
      for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
      const format = ((mask << 10) | remainder) ^ 0x5412;
      const formatBit = i => ((format >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) grid[i][8] = formatBit(i);
      grid[7][8] = formatBit(6);
      grid[8][8] = formatBit(7);
      grid[8][7] = formatBit(8);
      for (let i = 9; i < 15; i++) grid[8][14 - i] = formatBit(i);
      for (let i = 0; i < 8; i++) grid[8][size - 1 - i] = formatBit(i);
      for (let i = 8; i < 15; i++) grid[size - 15 + i][8] = formatBit(i);
      return grid;
    };

    // Pontua cada máscara pelas regras de legibilidade do padrão e fica com a melhor.
    const penalty = grid => {
      let score = 0;
      const columns = grid[0].map((_, x) => grid.map(row => row[x]));
      [...grid, ...columns].forEach(line => {
        let run = 1;
        for (let i = 1; i <= size; i++) {
          if (i < size && line[i] === line[i - 1]) {
            run++;
          } else {
            if (run >= 5) score += run - 2;
            run = 1;
          }
        }
        const pattern = line.map(dark => (dark ? 1 : 0)).join('');
        ['10111010000', '00001011101'].forEach(finderLike => {
          for (let at = pattern.indexOf(finderLike); at >= 0; at = pattern.indexOf(finderLike, at + 1)) score += 40;
        });
      });
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const color = grid[y][x];
          if (color === grid[y][x + 1] && color === grid[y + 1][x] && color === grid[y + 1][x + 1]) score += 3;
        }
      }
      const dark = grid.flat().filter(Boolean).length;
      score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return score;
    };

    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const grid = applyMask(mask);
      const score = penalty(grid);
      if (!best || score < best.score) best = { grid, score };
    }
    return best.grid;
  };

  // Desenha a matriz em SVG, com a margem clara exigida pelos leitores.
  const svg = text => {
    const grid = encode(text);
    const margin = 4;
    const size = grid.length + margin * 2;
    let path = '';
    grid.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) path += `M${x + margin} ${y + margin}h1v1h-1z`;
    }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
      `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  };

  return { encode, svg };
})();
