var dbClient = window._supabase;

let audioActual = null;
let botonActual = null;

async function pruebaConexion() {
    const { data, error } = await dbClient.from("canciones").select("*");
    console.log("DATA:", data);
    console.log("ERROR:", error);
}

pruebaConexion();

document.addEventListener("DOMContentLoaded", () => {

    const btnSubir = document.getElementById("btnSubir");
    const listaCanciones = document.getElementById("listaCanciones");

    cargarCanciones();

    btnSubir.addEventListener("click", async () => {

        const nombre = document.getElementById("nombreCancion").value.trim();
        const archivo = document.getElementById("archivoMp3").files[0];

        if (!nombre) { alert("Escribe un nombre para la canción"); return; }
        if (!archivo) { alert("Selecciona un archivo MP3"); return; }

        try {

            const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const nombreArchivo = Date.now() + "-" + nombreSeguro;

            const duracion = await new Promise((resolve) => {
                const audioTemp = new Audio(URL.createObjectURL(archivo));
                audioTemp.addEventListener("loadedmetadata", () => {
                    resolve(Math.floor(audioTemp.duration));
                });
            });

            const [{ error: errorSubida }, { data: urlData }] = await Promise.all([
                dbClient.storage.from("canciones").upload(nombreArchivo, archivo),
                Promise.resolve({ data: dbClient.storage.from("canciones").getPublicUrl(nombreArchivo) })
            ]);

            if (errorSubida) { alert(errorSubida.message); return; }

            const urlMp3 = urlData.data.publicUrl;

            const { error: errorBD } = await dbClient.from("canciones").insert({
                nombre: nombre,
                archivo_url: urlMp3,
                nombre_archivo: archivo.name,
                duracion: duracion
            });

            if (errorBD) { console.error(errorBD); alert("Error al guardar en la base de datos"); return; }

            document.getElementById("nombreCancion").value = "";
            document.getElementById("archivoMp3").value = "";

            crearTarjetaCancion({ nombre, archivo_url: urlMp3, nombre_archivo: archivo.name, duracion });

        } catch (error) {
            console.error(error);
            alert("Ocurrió un error");
        }

    });

    async function cargarCanciones() {
        const { data, error } = await dbClient.from("canciones").select("*").order("fecha_subida", { ascending: false });
        if (error) { console.error(error); return; }
        data.forEach(cancion => crearTarjetaCancion(cancion));
    }

    function crearTarjetaCancion(cancion) {

        const contenedor = document.createElement("div");
        contenedor.className = "cancion";

        let audio = null;

        const filaSuperior = document.createElement("div");
        filaSuperior.className = "fila-superior";

        const botonPlay = document.createElement("button");
        botonPlay.className = "play-btn";
        botonPlay.textContent = "▶";

        const titulo = document.createElement("span");
        titulo.className = "titulo";
        titulo.textContent = cancion.nombre;

        const tiempo = document.createElement("span");
        tiempo.className = "tiempo";
        tiempo.textContent = `0:00 / ${formatearTiempo(cancion.duracion)}`;

        const menuBtn = document.createElement("button");
        menuBtn.className = "menu-btn";
        menuBtn.textContent = "⋮";

        const menu = document.createElement("div");
        menu.className = "menu";

        const reanudarBtn = document.createElement("button");
        reanudarBtn.textContent = "🔄 Reiniciar";

        const eliminarBtn = document.createElement("button");
        eliminarBtn.textContent = "🗑 Eliminar";

        menu.appendChild(reanudarBtn);
        menu.appendChild(eliminarBtn);

        filaSuperior.appendChild(botonPlay);
        filaSuperior.appendChild(titulo);
        filaSuperior.appendChild(tiempo);
        filaSuperior.appendChild(menuBtn);

        const barra = document.createElement("div");
        barra.className = "barra";

        const progreso = document.createElement("div");
        progreso.className = "progreso";

        barra.appendChild(progreso);

        let arrastrando = false;
        let posicionArrastre = 0;

        function crearAudio() {
            if (audio) return;
            audio = new Audio(cancion.archivo_url);
            audio.preload = "none";

            audio.addEventListener("timeupdate", () => {
                if (arrastrando) return;
                const porcentaje = (audio.currentTime / audio.duration) * 100;
                progreso.style.width = porcentaje + "%";
                tiempo.textContent = `${formatearTiempo(audio.currentTime)} / ${formatearTiempo(audio.duration)}`;
            });

            audio.addEventListener("ended", () => {
                botonPlay.textContent = "▶";
                progreso.style.width = "0%";
                if (audioActual === audio) { audioActual = null; botonActual = null; }
            });
        }

        menuBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".menu").forEach(m => { if (m !== menu) m.classList.remove("mostrar"); });
            menu.classList.toggle("mostrar");
        });

        document.addEventListener("click", () => menu.classList.remove("mostrar"));

        reanudarBtn.addEventListener("click", async () => {
        crearAudio();
        if (audioActual && audioActual !== audio) { audioActual.pause(); if (botonActual) botonActual.textContent = "▶"; }
        audio.currentTime = 0;
        await audio.play();
        audioActual = audio;
        botonActual = botonPlay;
        botonPlay.textContent = "⏸";
        menu.classList.remove("mostrar");
        });

        eliminarBtn.addEventListener("click", async () => {
            if (!confirm(`¿Eliminar "${cancion.nombre}"?`)) return;
            try {
                const nombreArchivo = cancion.archivo_url.split("/").pop();
                const { error: errorStorage } = await dbClient.storage.from("canciones").remove([nombreArchivo]);
                if (errorStorage) console.error(errorStorage);
                const { error: errorBD } = await dbClient.from("canciones").delete().eq("id", cancion.id);
                if (errorBD) { console.error(errorBD); alert("Error al eliminar de la base de datos"); return; }
                if (audioActual === audio) { audio.pause(); audioActual = null; botonActual = null; }
                contenedor.remove();
            } catch (error) {
                console.error(error);
                alert("Error al eliminar");
            }
        });

        botonPlay.addEventListener("click", async () => {
            try {
                crearAudio();
                if (audio.paused) {
                    if (audioActual && audioActual !== audio) { audioActual.pause(); if (botonActual) botonActual.textContent = "▶"; }
                    await audio.play();
                    audioActual = audio;
                    botonActual = botonPlay;
                    botonPlay.textContent = "⏸";
                } else {
                    audio.pause();
                    if (audioActual === audio) { audioActual = null; botonActual = null; }
                    botonPlay.textContent = "▶";
                }
            } catch (error) { console.error(error); }
        });

        barra.addEventListener("mousedown", (e) => {
            e.preventDefault();
            arrastrando = true;
            const rect = barra.getBoundingClientRect();
            posicionArrastre = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
            progreso.style.width = (posicionArrastre * 100) + "%";
        });

        document.addEventListener("mousemove", (e) => {
            if (!arrastrando) return;
            const rect = barra.getBoundingClientRect();
            posicionArrastre = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
            progreso.style.width = (posicionArrastre * 100) + "%";
        });

        document.addEventListener("mouseup", () => {
            if (!arrastrando) return;
            arrastrando = false;
            if (audio) audio.currentTime = posicionArrastre * audio.duration;
        });

        contenedor.appendChild(filaSuperior);
        contenedor.appendChild(menu);
        contenedor.appendChild(barra);
        listaCanciones.appendChild(contenedor);
    }

});

function formatearTiempo(segundos) {
    if (isNaN(segundos)) return "0:00";
    const minutos = Math.floor(segundos / 60);
    const seg = Math.floor(segundos % 60);
    return `${minutos}:${seg.toString().padStart(2, "0")}`;
}