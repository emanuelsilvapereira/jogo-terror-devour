// Arquivo: app/types.ts

export type Elemento = 'fogo' | 'raio' | 'agua' | 'terra';

export type Personagem = {
  id: string;
  nome: string;
  elemento: Elemento;
  x: number;
  y: number;
  imagemUrl: string; // <-- NOVO: Preparando para os gráficos reais!
  corBase: string;   // <-- NOVO: Uma cor para destacar o herói enquanto não temos a imagem
};