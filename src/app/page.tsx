'use client'

import { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Billboard, useTexture, Text, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';

// ==========================================
// 1. CONFIGURAÇÕES DO MAPA
// ==========================================
const TAMANHO_CASA = 40;
// Agora as paredes têm [Pos X, Pos Z, Largura, Profundidade]
const PAREDES_MAPA = [
  [0, -20, 40, 1], [0, 20, 40, 1], [-20, 0, 1, 40], [20, 0, 1, 40], 
  [-5, 0, 1, 20], [5, 5, 1, 30], [-12, -10, 15, 1], [12, 10, 15, 1], 
];
const POSICAO_ALTAR: [number, number, number] = [0, 0, 0];

// ==========================================
// 2. SISTEMA DE TECLADO
// ==========================================
function usarTeclado() {
  const [teclas, setTeclas] = useState({ w: false, a: false, s: false, d: false, f: false, shift: false, espaco: false });

  useEffect(() => {
    const apertar = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) setTeclas(t => ({ ...t, [key]: true }));
      if (key === 'f') setTeclas(t => ({ ...t, f: !t.f }));
      if (e.key === 'Shift') setTeclas(t => ({ ...t, shift: true }));
      if (e.key === ' ') setTeclas(t => ({ ...t, espaco: true }));
    };
    const soltar = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) setTeclas(t => ({ ...t, [key]: false }));
      if (e.key === 'Shift') setTeclas(t => ({ ...t, shift: false }));
      if (e.key === ' ') setTeclas(t => ({ ...t, espaco: false }));
    };
    window.addEventListener('keydown', apertar);
    window.addEventListener('keyup', soltar);
    return () => { window.removeEventListener('keydown', apertar); window.removeEventListener('keyup', soltar); };
  }, []);

  return teclas;
}

// ==========================================
// 3. JOGADOR COM FÍSICA REAL (Rapier)
// ==========================================
function JogadorFisico({ 
  stamina, setStamina, segurandoItem, setSegurandoItem, itens, setItens, setColetados 
}: any) {
  const { camera } = useThree();
  const corpoRef = useRef<any>(null); // Referência ao corpo físico do jogador
  const lanternaRef = useRef<THREE.SpotLight>(null);
  const teclas = usarTeclado();

  // Vetores de matemática pesada para calcular a direção do movimento baseada na câmera
  const direcaoFrente = new THREE.Vector3();
  const direcaoLado = new THREE.Vector3();
  const direcaoMovi = new THREE.Vector3();

  useFrame((state) => {
    if (!corpoRef.current) return;

    // 1. STAMINA
    const tentandoCorrer = teclas.shift && (teclas.w || teclas.a || teclas.s || teclas.d);
    const podeCorrer = tentandoCorrer && stamina > 0;
    if (podeCorrer) setStamina((s: number) => Math.max(0, s - 1));
    else if (!tentandoCorrer) setStamina((s: number) => Math.min(100, s + 0.3));

    const vel = podeCorrer ? 8 : 4; // Velocidade física (Força aplicada)

    // 2. CÁLCULO DE MOVIMENTO (Baseado em para onde a câmera olha)
    state.camera.getWorldDirection(direcaoFrente);
    direcaoFrente.y = 0; // Ignora o eixo Y para não voar ao olhar pra cima
    direcaoFrente.normalize();
    direcaoLado.crossVectors(state.camera.up, direcaoFrente).normalize();

    direcaoMovi.set(0, 0, 0);
    if (teclas.w) direcaoMovi.add(direcaoFrente);
    if (teclas.s) direcaoMovi.sub(direcaoFrente);
    if (teclas.a) direcaoMovi.add(direcaoLado);
    if (teclas.d) direcaoMovi.sub(direcaoLado);
    direcaoMovi.normalize().multiplyScalar(vel);

    // 3. APLICA A VELOCIDADE NO CORPO FÍSICO
    // Mantemos a velocidade Y (queda da gravidade) igual
    corpoRef.current.setLinvel({ x: direcaoMovi.x, y: corpoRef.current.linvel().y, z: direcaoMovi.z }, true);

    // 4. GRUDA A CÂMERA NO CORPO E A LANTERNA NA CÂMERA
    const posCorpo = corpoRef.current.translation();
    camera.position.set(posCorpo.x, posCorpo.y + 0.6, posCorpo.z); // A câmera fica na "cabeça" da cápsula

    if (lanternaRef.current) {
      lanternaRef.current.position.copy(camera.position);
      const dirLanterna = new THREE.Vector3();
      camera.getWorldDirection(dirLanterna);
      lanternaRef.current.target.position.copy(camera.position).add(dirLanterna);
      lanternaRef.current.target.updateMatrixWorld();
      lanternaRef.current.intensity = teclas.f ? 0 : 5;
    }

    // 5. LÓGICA DE ITENS (Igual antes)
    if (!segurandoItem) {
      const itemPerto = itens.findIndex((pos: number[]) => camera.position.distanceTo(new THREE.Vector3(pos[0], 0, pos[2])) < 2);
      if (itemPerto !== -1) {
        setSegurandoItem(true);
        setItens((prev: number[][]) => prev.filter((_, idx) => idx !== itemPerto));
      }
    }
    if (segurandoItem) {
      const distanciaAltar = camera.position.distanceTo(new THREE.Vector3(...POSICAO_ALTAR));
      if (distanciaAltar < 3) {
        setSegurandoItem(false);
        setColetados((c: number) => c + 1);
      }
    }
  });

  return (
    <>
      <spotLight ref={lanternaRef} color="#fff5d4" angle={0.6} penumbra={0.3} distance={60} decay={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      {lanternaRef.current && <primitive object={lanternaRef.current.target} />}
      
      {/* O CORPO FÍSICO DO JOGADOR (Uma cápsula invisível que sofre gravidade e não atravessa parede) */}
      <RigidBody ref={corpoRef} colliders={false} mass={1} type="dynamic" position={[0, 2, 18]} enabledRotations={[false, false, false]}>
        <CapsuleCollider args={[0.5, 0.4]} /> {/* Altura e Largura do jogador */}
      </RigidBody>
    </>
  );
}

// ==========================================
// 4. A CASA COM FÍSICA (Paredes Sólidas)
// ==========================================
function CasaFisica() {
  const tParede = useTexture('/parede.jpg');
  const tChao = useTexture('/chao.jpg');
  [tParede, tChao].forEach(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; });
  tChao.repeat.set(10, 10);
  tParede.repeat.set(2, 1);

  return (
    <group>
      <ambientLight intensity={0.3} />
      
      {/* CHÃO (Fixo) */}
      <RigidBody type="fixed">
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[TAMANHO_CASA, TAMANHO_CASA]} />
          <meshStandardMaterial map={tChao} color="#444" />
        </mesh>
      </RigidBody>

      {/* TETO */}
      <mesh position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[TAMANHO_CASA, TAMANHO_CASA]} />
        <meshStandardMaterial color="#050505" />
      </mesh>

      {/* PAREDES (Fixas) */}
      {PAREDES_MAPA.map((p, i) => (
        <RigidBody key={i} type="fixed">
          <mesh position={[p[0], 2, p[1]]} castShadow receiveShadow>
            <boxGeometry args={[p[2], 4, p[3]]} />
            <meshStandardMaterial map={tParede} color="#666" />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

// ==========================================
// 5. O MONSTRO (Mantido sem gravidade para não travar nas paredes ainda)
// ==========================================
function Monstro({ velocidade, onPegou, volumeGeral }: any) {
  const { scene } = useGLTF('/art.glb'); 
  const ref = useRef<THREE.Group>(null);
  const audioMonstro = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioMonstro.current = new Audio('/som-monstro.mp3'); 
    audioMonstro.current.loop = true;
    audioMonstro.current.play().catch(() => {});
    
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return () => audioMonstro.current?.pause();
  }, [scene]);

  useFrame(({ camera }) => {
    if (!ref.current) return;
    
    const posicaoMonstro = ref.current.position;
    const distancia = posicaoMonstro.distanceTo(camera.position);

    if (audioMonstro.current) {
      const volumeDistancia = Math.max(0, 1 - (distancia / 20)); 
      audioMonstro.current.volume = volumeDistancia * volumeGeral; 
    }

    const dir = camera.position.clone().sub(posicaoMonstro).normalize();
    dir.y = 0;
    ref.current.position.add(dir.multiplyScalar(velocidade));
    ref.current.lookAt(camera.position.x, ref.current.position.y, camera.position.z);
    
    if (distancia < 1.5) onPegou();
  });

  return (
    <group ref={ref} position={[0, 0, -10]}>
      <primitive object={scene} scale={2.5} position={[0, -1.6, 0]} />
    </group>
  );
}

// ... (MANTENHA O AltarRitual, ItemColetavel E CameraMenu IGUAIS) ...
function AltarRitual() {
  return (
    <group position={POSICAO_ALTAR}>
      <pointLight color="#ff4400" intensity={2} distance={15} castShadow />
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[1.5, 1.5, 1]} />
        <meshStandardMaterial color="#222" roughness={0.9} />
      </mesh>
    </group>
  );
}

function ItemColetavel({ posicao }: { posicao: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.05; });
  return (
    <group ref={ref} position={posicao}>
      <pointLight color="red" intensity={0.5} distance={5} />
      <Billboard position={[0, 1, 0]}>
         <Text fontSize={1.2}>🐐</Text>
      </Billboard>
    </group>
  );
}

function CameraMenu() {
  useFrame(({ clock, camera }) => {
    const tempo = clock.getElapsedTime() * 0.2;
    camera.position.x = Math.sin(tempo) * 15;
    camera.position.z = Math.cos(tempo) * 15;
    camera.position.y = 5;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ==========================================
// 6. O MOTOR PRINCIPAL
// ==========================================
export default function JogoFinalSinglePlayer() {
  const [estado, setEstado] = useState<'MENU' | 'CONFIG' | 'JOGANDO' | 'JUMPSCARE' | 'GAMEOVER' | 'VITORIA'>('MENU');
  
  const [itens, setItens] = useState([[10, 0, -10], [-15, 0, 5], [5, 0, 15], [-12, 0, -15], [0, 0, 10]]);
  const [coletados, setColetados] = useState(0);
  const [stamina, setStamina] = useState(100);
  const [segurandoItem, setSegurandoItem] = useState(false);
  const [volumeGeral, setVolumeGeral] = useState(0.5);

  const ativarJumpscare = () => {
    setEstado('JUMPSCARE');
    const som = new Audio('/susto.mp3'); 
    som.volume = volumeGeral;
    som.play().catch(() => {});
    setTimeout(() => { setEstado('GAMEOVER'); }, 2000);
  };

  const reiniciarJogo = () => {
    setItens([[10, 0, -10], [-15, 0, 5], [5, 0, 15], [-12, 0, -15], [0, 0, 10]]);
    setColetados(0); setStamina(100); setSegurandoItem(false);
    setEstado('JOGANDO');
  };

  return (
    <div className="w-screen h-screen bg-black relative select-none">
      
      {/* HUD, Menus e Telas (Tudo igual ao código anterior) */}
      {estado === 'JOGANDO' && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-20 pointer-events-none">
          <div className="flex flex-col gap-2">
             <h2 className="text-white font-black text-2xl uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">Demônios Banidos: <span className="text-red-500">{coletados} / 5</span></h2>
             <div className={`px-4 py-2 border ${segurandoItem ? 'border-green-400 bg-green-900/80 text-white' : 'border-zinc-500 bg-black/60 text-zinc-300'} font-bold uppercase w-fit backdrop-blur-sm`}>
               Mãos: {segurandoItem ? '🐐 Bode Capturado (Leve ao Altar!)' : 'Vazias'}
             </div>
          </div>
          <div className="text-right w-64 drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
             <p className="text-zinc-300 font-bold uppercase text-sm mb-1 tracking-widest">Fôlego (SHIFT)</p>
             <div className="w-full h-3 bg-zinc-900/80 border border-zinc-600 rounded-sm overflow-hidden"><div className={`h-full transition-all ${stamina < 20 ? 'bg-red-600' : 'bg-white'}`} style={{ width: `${stamina}%` }} /></div>
          </div>
        </div>
      )}

      {estado === 'MENU' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-black/60 p-16 rounded-lg text-center backdrop-blur-md shadow-2xl flex flex-col items-center gap-4">
            <h1 className="text-8xl font-black text-red-600 mb-8 tracking-[0.2em]">O RITUAL</h1>
            <button onClick={() => setEstado('JOGANDO')} className="px-12 py-4 border border-red-700 text-red-500 hover:bg-red-700 hover:text-white uppercase font-black w-full">Jogar</button>
            <button onClick={() => setEstado('CONFIG')} className="px-12 py-4 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white uppercase font-black w-full">Configurações</button>
          </div>
        </div>
      )}

      {estado === 'CONFIG' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-white">
           <h2 className="text-4xl font-bold mb-8 uppercase text-red-500">Configurações</h2>
           <div className="w-96 mb-8 flex flex-col gap-4">
             <label className="text-zinc-400 uppercase">Volume Geral: {Math.round(volumeGeral * 100)}%</label>
             <input type="range" min="0" max="1" step="0.1" value={volumeGeral} onChange={(e) => setVolumeGeral(parseFloat(e.target.value))} className="w-full accent-red-600" />
           </div>
           <button onClick={() => setEstado('MENU')} className="px-8 py-3 border border-red-900 text-white font-bold uppercase hover:bg-red-900">Salvar e Voltar</button>
        </div>
      )}

      {estado === 'JUMPSCARE' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black">
          <img src="/palhaco.jpg" alt="Jumpscare" className="w-full h-full object-cover animate-ping scale-150 mix-blend-screen" />
        </div>
      )}

      {estado === 'GAMEOVER' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-sm text-white border-[20px] border-black">
          <h1 className="text-8xl font-black text-black mb-8 uppercase drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]">MORTO</h1>
          <button onClick={reiniciarJogo} className="px-8 py-4 bg-black border border-red-900 text-red-500 font-bold uppercase hover:bg-red-900 hover:text-white">Voltar ao Pesadelo</button>
        </div>
      )}

      {/* MOTOR 3D COM A TAG <Physics>! */}
      <Canvas shadows camera={{ fov: 75 }}>
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', 15, 40]} />
        
        {(estado === 'MENU' || estado === 'CONFIG') && <CameraMenu />}
        {estado === 'JOGANDO' && <PointerLockControls makeDefault />}
        
        <Suspense fallback={null}>
          {/* A Mágica de Gravidade e Colisão acontece aqui dentro */}
          <Physics gravity={[0, -9.81, 0]}>
            <CasaFisica />
            {estado === 'JOGANDO' && (
              <JogadorFisico stamina={stamina} setStamina={setStamina} segurandoItem={segurandoItem} setSegurandoItem={setSegurandoItem} itens={itens} setItens={setItens} setColetados={setColetados} />
            )}
          </Physics>

          <AltarRitual />
          {estado === 'JOGANDO' && (
             <Monstro velocidade={0.035 + (coletados * 0.015)} onPegou={ativarJumpscare} volumeGeral={volumeGeral} />
          )}
          {itens.map((pos, i) => <ItemColetavel key={i} posicao={pos as [number, number, number]} />)}
        </Suspense>
      </Canvas>
    </div>
  );
}