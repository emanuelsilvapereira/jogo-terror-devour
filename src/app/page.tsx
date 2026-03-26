'use client'

import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Billboard, Text, useGLTF } from '@react-three/drei';
import { Physics, RigidBody, CapsuleCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { io } from 'socket.io-client';

const POSICAO_ALTAR: [number, number, number] = [0, 0, 0];

function usarTeclado() {
  const [teclas, setTeclas] = useState({ w: false, a: false, s: false, d: false, f: false, shift: false, espaco: false, q: false });

  useEffect(() => {
    const apertar = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) setTeclas(t => ({ ...t, [key]: true }));
      if (key === 'f') setTeclas(t => ({ ...t, f: !t.f }));
      if (key === 'q') setTeclas(t => ({ ...t, q: !t.q }));
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
// FÍSICA DO JOGADOR LOCAL (COM BALANÇO DE PASSOS)
// ==========================================
function JogadorFisico({ 
  stamina, setStamina, bateria, setBateria, segurandoItem, setSegurandoItem, itens, setItens, 
  setColetados, pilhas, setPilhas, socket, temChaveAzul, setTemChaveAzul, posChave
}: any) {
  const { camera } = useThree();
  const corpoRef = useRef<any>(null); 
  const lanternaRef = useRef<THREE.SpotLight>(null);
  const teclas = usarTeclado();

  const direcaoFrente = new THREE.Vector3();
  const direcaoLado = new THREE.Vector3();
  const direcaoMovi = new THREE.Vector3();

  useFrame((state) => {
    if (!corpoRef.current) return;

    const tentandoCorrer = teclas.shift && (teclas.w || teclas.a || teclas.s || teclas.d);
    const podeCorrer = tentandoCorrer && stamina > 0;
    if (podeCorrer) setStamina((s: number) => Math.max(0, s - 1));
    else if (!tentandoCorrer) setStamina((s: number) => Math.min(100, s + 0.3));

    const vel = podeCorrer ? 8 : 4; 
    state.camera.getWorldDirection(direcaoFrente);
    direcaoFrente.y = 0; direcaoFrente.normalize();
    direcaoLado.crossVectors(state.camera.up, direcaoFrente).normalize();

    direcaoMovi.set(0, 0, 0);
    if (teclas.w) direcaoMovi.add(direcaoFrente);
    if (teclas.s) direcaoMovi.sub(direcaoFrente);
    if (teclas.a) direcaoMovi.add(direcaoLado);
    if (teclas.d) direcaoMovi.sub(direcaoLado);
    direcaoMovi.normalize().multiplyScalar(vel);

    corpoRef.current.setLinvel({ x: direcaoMovi.x, y: corpoRef.current.linvel().y, z: direcaoMovi.z }, true);
    const posCorpo = corpoRef.current.translation();
    
    // 👇 AQUI ESTÁ A FÍSICA DOS SEUS PASSOS (Head Bobbing) 👇
    let alturaCamera = posCorpo.y + 0.6;
    if (direcaoMovi.lengthSq() > 0) {
      // Faz a câmera subir e descer simulando os passos
      const velocidadePasso = podeCorrer ? 15 : 10;
      alturaCamera += Math.sin(state.clock.elapsedTime * velocidadePasso) * 0.05;
    }
    camera.position.set(posCorpo.x, alturaCamera, posCorpo.z); 

    const lanternaLigada = !teclas.f && bateria > 0;
    if (lanternaLigada) {
      const gasto = teclas.q ? 0.05 : 0.02; 
      setBateria((b: number) => Math.max(0, b - gasto));
    }

    if (lanternaRef.current) {
      lanternaRef.current.position.copy(camera.position);
      const dirLanterna = new THREE.Vector3();
      camera.getWorldDirection(dirLanterna);
      lanternaRef.current.target.position.copy(camera.position).add(dirLanterna);
      lanternaRef.current.target.updateMatrixWorld();
      lanternaRef.current.intensity = lanternaLigada ? (teclas.q ? 3 : 5) : 0;
      lanternaRef.current.color.set(teclas.q ? "#8a2be2" : "#fff5d4"); 
    }

    if (socket && (direcaoMovi.lengthSq() > 0 || teclas.f || teclas.q)) {
      socket.emit('movimento', {
        x: posCorpo.x, y: posCorpo.y, z: posCorpo.z,
        lanternaLigada: lanternaLigada, corUV: teclas.q
      });
    }

    const pilhaPerto = pilhas.findIndex((pos: number[]) => camera.position.distanceTo(new THREE.Vector3(pos[0], 0, pos[2])) < 2);
    if (pilhaPerto !== -1 && bateria < 100) {
      setBateria(100); 
      setPilhas((prev: number[][]) => prev.filter((_, idx) => idx !== pilhaPerto)); 
    }

    if (!temChaveAzul) {
      const distChave = camera.position.distanceTo(new THREE.Vector3(...posChave));
      if (distChave < 1.5) setTemChaveAzul(true);
    }

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
      <spotLight ref={lanternaRef} angle={0.6} penumbra={0.3} distance={60} decay={1.2} castShadow shadow-mapSize={[1024, 1024]} />
      {lanternaRef.current && <primitive object={lanternaRef.current.target} />}
      <RigidBody ref={corpoRef} colliders={false} mass={1} type="dynamic" position={[0, 2, 18]} enabledRotations={[false, false, false]}>
        <CapsuleCollider args={[0.5, 0.4]} />
      </RigidBody>
    </>
  );
}

// ==========================================
// OS OUTROS JOGADORES (AGORA COM MODELO 3D)
// ==========================================
function AmigoMultiplayer({ dados }: { dados: any }) {
  // 👇 AGORA EXIGE O MODELO jogador.glb NA PASTA PUBLIC 👇
  const { scene } = useGLTF('/jogador.glb'); 
  const amigoClone = useMemo(() => scene.clone(), [scene]);
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) {
      // Faz o corpo do seu amigo "quicar" para simular que ele está andando também
      ref.current.position.y = dados.y + (Math.sin(state.clock.elapsedTime * 10) * 0.05);
    }
  });

  return (
    <group ref={ref} position={[dados.x, dados.y, dados.z]}>
      {/* Ajuste o scale se o modelo do jogador ficar gigante ou pequeno! */}
      <primitive object={amigoClone} scale={1} position={[0, -0.8, 0]} castShadow />
      
      {dados.lanternaLigada && (
        <pointLight distance={15} intensity={1.5} color={dados.corUV ? "#8a2be2" : "#fff5d4"} position={[0, 0.5, 0]} castShadow />
      )}
    </group>
  );
}

// ==========================================
// FÍSICA DO MONSTRO (PASSOS PESADOS)
// ==========================================
function Monstro({ velocidade, onPegou, volumeGeral }: any) {
  const { scene } = useGLTF('/art.glb'); 
  const ref = useRef<THREE.Group>(null);
  const audioMonstro = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioMonstro.current = new Audio('/som-monstro.mp3'); 
    audioMonstro.current.loop = true;
    audioMonstro.current.play().catch(() => {});
    scene.traverse((child) => { if ((child as THREE.Mesh).isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    return () => audioMonstro.current?.pause();
  }, [scene]);

  useFrame(({ clock, camera }) => {
    if (!ref.current) return;
    const pos = ref.current.position;
    const dist = pos.distanceTo(camera.position);
    if (audioMonstro.current) audioMonstro.current.volume = Math.max(0, 1 - (dist / 20)) * volumeGeral; 
    
    const dir = camera.position.clone().sub(pos).normalize(); dir.y = 0;
    ref.current.position.add(dir.multiplyScalar(velocidade));
    ref.current.lookAt(camera.position.x, ref.current.position.y, camera.position.z);
    
    // 👇 FÍSICA DE ANDAR DO MONSTRO (Passos que afundam o corpo) 👇
    const balanco = Math.sin(clock.elapsedTime * 8) * 0.15;
    scene.position.y = -1.6 + balanco;

    if (dist < 1.5) onPegou();
  });

  return <group ref={ref} position={[0, 0, -10]}><primitive object={scene} scale={2.5} position={[0, -1.6, 0]} /></group>;
}

// ==========================================
// A CASA (AGORA MAIOR)
// ==========================================
function CasaFisica() {
  const { scene } = useGLTF('/casa.glb'); 

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [scene]);

  return (
    <group>
      <ambientLight intensity={3} color="#ffffff" /> 
      <RigidBody type="fixed" colliders="trimesh">
        {/* 👇 ESCALA DA CASA AUMENTADA DE 1 PARA 3 👇 */}
        <primitive object={scene} scale={3} position={[0, 0, 0]} />
      </RigidBody>
      
      <RigidBody type="fixed" position={[0, -0.5, 0]}>
        <mesh><boxGeometry args={[200, 1, 200]} /><meshBasicMaterial transparent opacity={0} /></mesh>
      </RigidBody>
    </group>
  );
}

// ==========================================
// FÍSICA DOS BODES (ELES AGORA QUICAM ANDANDO)
// ==========================================
function ItemColetavel({ posicao }: { posicao: [number, number, number] }) {
  const { scene } = useGLTF('/bode.glb'); 
  const ref = useRef<THREE.Group>(null);
  const bodeClone = useMemo(() => scene.clone(), [scene]);

  useFrame((state) => { 
    if (ref.current) {
      ref.current.rotation.y += 0.05; 
      // 👇 FÍSICA DOS PASSOS DO BODE 👇
      bodeClone.position.y = -0.5 + Math.abs(Math.sin(state.clock.elapsedTime * 6) * 0.2);
    }
  });

  return (
    <group ref={ref} position={posicao}>
      <pointLight color="red" intensity={0.8} distance={5} />
      <primitive object={bodeClone} scale={1} position={[0, -0.5, 0]} castShadow />
    </group>
  );
}

function PilhaColetavel({ posicao }: { posicao: [number, number, number] }) {
  const { scene } = useGLTF('/pilha.glb'); 
  const ref = useRef<THREE.Group>(null);
  const pilhaClone = useMemo(() => scene.clone(), [scene]);

  useFrame((state) => { 
    if (ref.current) { 
      ref.current.rotation.y += 0.02; 
      ref.current.position.y = (Math.sin(state.clock.elapsedTime * 2) * 0.2) + 0.5; 
    }
  });

  return (
    <group ref={ref} position={posicao}>
      <pointLight color="#22c55e" intensity={1} distance={3} />
      <primitive object={pilhaClone} scale={0.5} position={[0, 0, 0]} />
    </group>
  );
}

function ChaveColetavel({ posicao, pegou }: any) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => { 
    if (ref.current) { 
      ref.current.rotation.y += 0.03; 
      ref.current.position.y = (Math.sin(state.clock.elapsedTime * 3) * 0.1) + 0.3; 
    }
  });
  if (pegou) return null;
  return (
    <group ref={ref} position={posicao}>
      <pointLight color="#3b82f6" intensity={1} distance={3} />
      <Billboard position={[0, 0, 0]}><Text fontSize={0.6} color="#3b82f6">🗝️</Text></Billboard>
    </group>
  );
}

function PortaTrancada({ posicao, rotacao, temChave }: any) {
  const { camera } = useThree();
  const [aberta, setAberta] = useState(false);

  useFrame(() => {
    const distancia = camera.position.distanceTo(new THREE.Vector3(...posicao));
    if (distancia < 2 && temChave && !aberta) setAberta(true); 
  });

  if (aberta) return null; 

  return (
    <RigidBody type="fixed" position={posicao} rotation={rotacao}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[6, 4, 0.5]} />
        <meshStandardMaterial color={temChave ? "#555" : "#111"} />
        <pointLight color="red" intensity={0.5} distance={2} position={[0, 0, 0.5]} />
      </mesh>
    </RigidBody>
  );
}

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

function CameraMenu() {
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime() * 0.2;
    camera.position.set(Math.sin(t) * 15, 5, Math.cos(t) * 15);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ==========================================
// 6. O MOTOR PRINCIPAL
// ==========================================
export default function JogoFinalMultiplayer() {
  const [estado, setEstado] = useState<'MENU' | 'CONFIG' | 'JOGANDO' | 'JUMPSCARE' | 'GAMEOVER' | 'VITORIA'>('MENU');
  
  const [itens, setItens] = useState([[10, 0, -10], [-15, 0, 5], [5, 0, 15], [-12, 0, -15], [0, 0, 10]]);
  const [pilhas, setPilhas] = useState([[15, 0, 15], [-18, 0, -18], [10, 0, 5], [-5, 0, -15]]);
  
  const [coletados, setColetados] = useState(0);
  const [stamina, setStamina] = useState(100);
  const [bateria, setBateria] = useState(100); 
  const [segurandoItem, setSegurandoItem] = useState(false);
  
  const [temChaveAzul, setTemChaveAzul] = useState(false);
  const posChaveAzul = [-10, 0, 15];

  const [volumeGeral, setVolumeGeral] = useState(0.5);

  const [socket, setSocket] = useState<any>(null);
  const [jogadoresOnline, setJogadoresOnline] = useState<Record<string, any>>({});

  useEffect(() => {
    const novoSocket = io();
    setSocket(novoSocket);

    novoSocket.on('estadoInicial', (listaServidor) => {
      const copia = { ...listaServidor };
      if (novoSocket.id) delete copia[novoSocket.id];
      setJogadoresOnline(copia);
    });

    novoSocket.on('novoJogador', (dados) => {
      if (dados.id !== novoSocket.id) {
        setJogadoresOnline((prev) => ({ ...prev, [dados.id]: dados }));
      }
    });

    novoSocket.on('jogadorMoveu', (dados) => {
      setJogadoresOnline((prev) => ({ ...prev, [dados.id]: dados }));
    });

    novoSocket.on('jogadorDesconectou', (idDeles) => {
      setJogadoresOnline((prev) => {
        const copia = { ...prev };
        delete copia[idDeles];
        return copia;
      });
    });

    return () => { novoSocket.disconnect(); };
  }, []);

  const ativarJumpscare = () => {
    setEstado('JUMPSCARE');
    const som = new Audio('/susto.mp3'); som.volume = volumeGeral; som.play().catch(() => {});
    setTimeout(() => { setEstado('GAMEOVER'); }, 2000);
  };

  const reiniciarJogo = () => {
    setItens([[10, 0, -10], [-15, 0, 5], [5, 0, 15], [-12, 0, -15], [0, 0, 10]]);
    setPilhas([[15, 0, 15], [-18, 0, -18], [10, 0, 5], [-5, 0, -15]]);
    setColetados(0); setStamina(100); setBateria(100); 
    setSegurandoItem(false); setTemChaveAzul(false); 
    setEstado('JOGANDO');
  };

  return (
    <div className="w-screen h-screen bg-black relative select-none">
      
      {estado === 'JOGANDO' && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-20 pointer-events-none">
          <div className="flex flex-col gap-2">
             <h2 className="text-white font-black text-2xl uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">Demônios Banidos: <span className="text-red-500">{coletados} / 5</span></h2>
             
             <div className="flex gap-2">
               <div className={`px-4 py-2 border ${segurandoItem ? 'border-green-400 bg-green-900/80 text-white' : 'border-zinc-500 bg-black/60 text-zinc-300'} font-bold uppercase w-fit backdrop-blur-sm`}>
                 Mãos: {segurandoItem ? '🐐 Bode Capturado' : 'Vazias'}
               </div>
               
               {temChaveAzul && (
                 <div className="px-4 py-2 border border-blue-400 bg-blue-900/80 text-white font-bold uppercase w-fit backdrop-blur-sm animate-pulse">
                   🗝️ Chave do Porão
                 </div>
               )}
             </div>

             <p className="text-zinc-400 font-bold uppercase text-sm mt-2">Jogadores na sala: {Object.keys(jogadoresOnline).length + 1}</p>
          </div>
          
          <div className="text-right w-64 drop-shadow-[0_2px_2px_rgba(0,0,0,1)] flex flex-col gap-4">
             <div>
               <p className="text-zinc-300 font-bold uppercase text-sm mb-1 tracking-widest">Fôlego (SHIFT)</p>
               <div className="w-full h-3 bg-zinc-900/80 border border-zinc-600 rounded-sm"><div className={`h-full ${stamina < 20 ? 'bg-red-600' : 'bg-white'}`} style={{ width: `${stamina}%` }} /></div>
             </div>
             <div>
               <p className="text-zinc-300 font-bold uppercase text-sm mb-1 tracking-widest">{bateria <= 0 ? <span className="text-red-500 animate-pulse">SEM BATERIA!</span> : 'Lanterna (F) | UV (Q)'}</p>
               <div className="w-full h-3 bg-zinc-900/80 border border-zinc-600 rounded-sm"><div className={`h-full ${bateria < 20 ? 'bg-red-600 animate-pulse' : 'bg-yellow-400'}`} style={{ width: `${bateria}%` }} /></div>
             </div>
          </div>
        </div>
      )}

      {estado === 'MENU' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-black/60 p-16 rounded-lg text-center backdrop-blur-md shadow-2xl flex flex-col items-center gap-4">
            <h1 className="text-8xl font-black text-red-600 mb-8 tracking-[0.2em]">O RITUAL</h1>
            <button onClick={() => setEstado('JOGANDO')} className="px-12 py-4 border border-red-700 text-red-500 hover:bg-red-700 hover:text-white uppercase font-black w-full transition-all">Jogar</button>
            <button onClick={() => setEstado('CONFIG')} className="px-12 py-4 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white uppercase font-black w-full transition-all">Configurações</button>
          </div>
        </div>
      )}
      {estado === 'CONFIG' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-white">
           <h2 className="text-4xl font-bold mb-8 uppercase text-red-500">Configurações</h2>
           <div className="w-96 mb-8 flex flex-col gap-4">
             <label className="text-zinc-400 uppercase tracking-widest">Volume: {Math.round(volumeGeral * 100)}%</label>
             <input type="range" min="0" max="1" step="0.1" value={volumeGeral} onChange={(e) => setVolumeGeral(parseFloat(e.target.value))} className="w-full accent-red-600" />
           </div>
           <button onClick={() => setEstado('MENU')} className="px-8 py-3 border border-red-900 text-white font-bold uppercase hover:bg-red-900">Salvar e Voltar</button>
        </div>
      )}
      {estado === 'JUMPSCARE' && (<div className="absolute inset-0 z-50 flex items-center justify-center bg-black"><img src="/palhaco.jpg" alt="Jumpscare" className="w-full h-full object-cover animate-ping scale-150 mix-blend-screen" /><div className="absolute inset-0 bg-red-900 opacity-50 mix-blend-color-burn"></div></div>)}
      {estado === 'GAMEOVER' && (<div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-sm text-white border-[20px] border-black"><h1 className="text-8xl font-black text-black mb-8 uppercase tracking-[0.3em] drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]">MORTO</h1><button onClick={reiniciarJogo} className="px-8 py-4 bg-black border border-red-900 text-red-500 font-bold uppercase hover:bg-red-900 hover:text-white">Voltar ao Pesadelo</button></div>)}
      {estado === 'VITORIA' && (<div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-white"><h1 className="text-7xl font-black text-amber-500 mb-4 drop-shadow-[0_0_20px_rgba(245,158,11,0.5)]">O MAL FOI BANIDO</h1><button onClick={reiniciarJogo} className="px-8 py-3 mt-8 bg-white text-black font-bold uppercase hover:bg-amber-500 hover:text-white">Jogar Novamente</button></div>)}

      <Canvas shadows camera={{ fov: 75 }}>
        <color attach="background" args={['#050505']} />
        
        {(estado === 'MENU' || estado === 'CONFIG') && <CameraMenu />}
        {estado === 'JOGANDO' && <PointerLockControls makeDefault />}
        
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]}>
            <CasaFisica />
            
            <PortaTrancada posicao={[0, 2, 8]} rotacao={[0, 0, 0]} temChave={temChaveAzul} />

            {estado === 'JOGANDO' && (
              <JogadorFisico 
                stamina={stamina} setStamina={setStamina} bateria={bateria} setBateria={setBateria} 
                segurandoItem={segurandoItem} setSegurandoItem={setSegurandoItem} 
                itens={itens} setItens={setItens} setColetados={setColetados} 
                pilhas={pilhas} setPilhas={setPilhas} 
                socket={socket} 
                temChaveAzul={temChaveAzul} setTemChaveAzul={setTemChaveAzul} posChave={posChaveAzul}
              />
            )}
          </Physics>

          <AltarRitual />
          <ChaveColetavel posicao={posChaveAzul} pegou={temChaveAzul} />

          {estado === 'JOGANDO' && (
             <Monstro velocidade={0.035 + (coletados * 0.015)} onPegou={ativarJumpscare} volumeGeral={volumeGeral} />
          )}
          
          {itens.map((pos, i) => <ItemColetavel key={`bode-${i}`} posicao={pos as [number, number, number]} />)}
          {pilhas.map((pos, i) => <PilhaColetavel key={`pilha-${i}`} posicao={pos as [number, number, number]} />)}
          
          {Object.entries(jogadoresOnline).map(([id, dados]) => (
            <AmigoMultiplayer key={id} dados={dados} />
          ))}
          
        </Suspense>
      </Canvas>
    </div>
  );
}