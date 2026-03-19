'use client'

import { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Billboard, useTexture, Text } from '@react-three/drei';
import * as THREE from 'three';

// ==========================================
// 1. CONFIGURAÇÕES E TIPOS
// ==========================================
const TAMANHO_CASA = 40;
const PAREDES_MAPA = [
  [0, -20, 40, 1], [0, 20, 40, 1], [-20, 0, 1, 40], [20, 0, 1, 40], // Externas
  [-5, 0, 1, 20], [5, 5, 1, 30], [-12, -10, 15, 1], [12, 10, 15, 1], // Internas
];

// ==========================================
// 2. JOGADOR COM COLISÃO E LANTERNA
// ==========================================
function Jogador({ posicoesParedes }: { posicoesParedes: number[][] }) {
  const { camera } = useThree();
  const lanternaRef = useRef<THREE.SpotLight>(null);
  const [teclas, setTeclas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    camera.position.set(0, 1.6, 18);
    const down = (e: KeyboardEvent) => setTeclas(t => ({ ...t, [e.key.toLowerCase()]: true }));
    const up = (e: KeyboardEvent) => setTeclas(t => ({ ...t, [e.key.toLowerCase()]: false }));
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [camera]);

  useFrame(() => {
    const vel = 0.12;
    const novaPos = camera.position.clone();
    
    if (teclas['w']) novaPos.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(vel));
    if (teclas['s']) novaPos.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-vel));

    // COLISÃO SIMPLES: Checa se a nova posição entra em alguma parede
    const colidiu = posicoesParedes.some(p => {
      const margin = 0.8;
      return novaPos.x > p[0] - p[2]/2 - margin && novaPos.x < p[0] + p[2]/2 + margin &&
             novaPos.z > p[1] - p[3]/2 - margin && novaPos.z < p[1] + p[3]/2 + margin;
    });

    if (!colidiu) {
      camera.position.x = novaPos.x;
      camera.position.z = novaPos.z;
    }
    camera.position.y = 1.6;

    if (lanternaRef.current) {
      lanternaRef.current.position.copy(camera.position);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      lanternaRef.current.target.position.copy(camera.position).add(dir);
      lanternaRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <spotLight
        ref={lanternaRef}
        color="#fff5d4"
        angle={0.4}
        penumbra={0.6}
        distance={45}
        intensity={3.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {lanternaRef.current && <primitive object={lanternaRef.current.target} />}
    </>
  );
}

// ==========================================
// 3. MONSTRO CAÇADOR
// ==========================================
function Monstro({ velocidade, onPegou }: { velocidade: number, onPegou: () => void }) {
  const textura = useTexture('/palhaco.jpg');
  const ref = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    if (!ref.current) return;
    const dir = camera.position.clone().sub(ref.current.position).normalize();
    dir.y = 0;
    ref.current.position.add(dir.multiplyScalar(velocidade));
    if (ref.current.position.distanceTo(camera.position) < 1.5) onPegou();
  });

  return (
    <Billboard ref={ref} position={[0, 1.5, -10]}>
      <mesh castShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial map={textura} transparent alphaTest={0.5} />
      </mesh>
    </Billboard>
  );
}

// ==========================================
// 4. ITENS DO RITUAL (BODES)
// ==========================================
function ItemColetavel({ posicao, onColeta }: { posicao: [number, number, number], onColeta: () => void }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (ref.current && ref.current.position.distanceTo(camera.position) < 2) {
      onColeta();
    }
    if (ref.current) ref.current.rotation.y += 0.05; // Girar item
  });

  return (
    <group ref={ref} position={posicao}>
      <pointLight color="red" intensity={0.5} distance={5} />
      <Billboard>
         <Text fontSize={1.5} color="white">🐐</Text>
      </Billboard>
    </group>
  );
}

// ==========================================
// 5. AMBIENTE (CASA)
// ==========================================
function Casa() {
  const tParede = useTexture('/parede.jpg');
  const tChao = useTexture('/chao.jpg');
  [tParede, tChao].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  tChao.repeat.set(10, 10);
  tParede.repeat.set(2, 1);

  return (
    <group>
      <ambientLight intensity={0.05} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[TAMANHO_CASA, TAMANHO_CASA]} />
        <meshStandardMaterial map={tChao} color="#444" />
      </mesh>
      <mesh position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TAMANHO_CASA, TAMANHO_CASA]} />
        <meshStandardMaterial color="#050505" />
      </mesh>
      {PAREDES_MAPA.map((p, i) => (
        <mesh key={i} position={[p[0], 2, p[1]]} castShadow receiveShadow>
          <boxGeometry args={[p[2], 4, p[3]]} />
          <meshStandardMaterial map={tParede} color="#666" />
        </mesh>
      ))}
    </group>
  );
}

// ==========================================
// 6. MOTOR PRINCIPAL
// ==========================================
export default function JogoDevour() {
  const [estado, setEstado] = useState<'MENU' | 'JOGANDO' | 'GAMEOVER' | 'VITORIA'>('MENU');
  const [itens, setItens] = useState([[10, 0, -10], [-15, 0, 5], [5, 0, 15], [-12, 0, -15], [0, 0, 0]]);
  const [coletados, setColetados] = useState(0);

  const velocidadeMonstro = 0.03 + (coletados * 0.015);

  return (
    <div className="w-screen h-screen bg-black relative">
      
      {/* HUD */}
      {estado === 'JOGANDO' && (
        <div className="absolute top-10 left-10 z-20 text-red-600 font-mono text-xl uppercase tracking-tighter">
          Bodes Resgatados: {coletados} / 5
        </div>
      )}

      {/* TELAS */}
      {estado === 'MENU' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black">
          <h1 className="text-8xl font-black text-red-700 mb-8 animate-pulse">DEVOUR</h1>
          <button onClick={() => setEstado('JOGANDO')} className="px-10 py-4 border border-red-700 text-red-500 hover:bg-white transition-all uppercase font-bold">Entrar na Mansão</button>
        </div>
      )}

      {estado === 'GAMEOVER' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-950 text-white">
          <h1 className="text-9xl mb-8">💀</h1>
          <h2 className="text-5xl font-black mb-8">VOCÊ FOI CONSUMIDO</h2>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-black font-bold uppercase">Tentar Novamente</button>
        </div>
      )}

      {estado === 'VITORIA' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-green-950 text-white">
          <h1 className="text-9xl mb-8">✨</h1>
          <h2 className="text-5xl font-black mb-8">RITUAL COMPLETO</h2>
          <p className="mb-8">Você baniu o palhaço das sombras.</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-white text-black font-bold uppercase">Jogar de Novo</button>
        </div>
      )}

      <Canvas shadows camera={{ fov: 75 }}>
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 5, 30]} />
        
        {estado === 'JOGANDO' && (
          <>
            <PointerLockControls />
            <Jogador posicoesParedes={PAREDES_MAPA} />
            <Suspense fallback={null}>
              <Casa />
              <Monstro velocidade={velocidadeMonstro} onPegou={() => setEstado('GAMEOVER')} />
              {itens.map((pos, i) => (
                <ItemColetavel 
                  key={i} 
                  posicao={pos as [number, number, number]} 
                  onColeta={() => {
                    setItens(prev => prev.filter((_, idx) => idx !== i));
                    setColetados(c => {
                      if (c + 1 === 5) setEstado('VITORIA');
                      return c + 1;
                    });
                  }} 
                />
              ))}
            </Suspense>
          </>
        )}
      </Canvas>
    </div>
  );
}