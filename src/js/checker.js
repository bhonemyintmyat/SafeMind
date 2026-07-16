import { supabase } from "./backend-client.js";

const phoneInput = document.getElementById("phoneInput");
const notesInput = document.getElementById("notesInput");
const checkerResult = document.getElementById("checkerResult");
const scamList = document.getElementById("scamList");
const safeList = document.getElementById("safeList");
const otherList = document.getElementById("otherList");

function normalizePhone(value) {
    return value.replace(/[^\d+]/g, "").trim();
}

function setResult(message, state = "neutral") {
    if (!checkerResult) return;
    checkerResult.className = `checker-result ${state}`;
    checkerResult.textContent = message;
}

function renderList(listElement, rows, emptyLabel) {
    listElement.innerHTML = "";

    if (!rows.length) {
        const item = document.createElement("li");
        item.textContent = emptyLabel;
        listElement.appendChild(item);
        return;
    }

    rows.forEach((row) => {
        const item = document.createElement("li");
        const label = row.label ? `${row.label} ` : "";
        item.textContent = `${label}${row.phone}`;
        listElement.appendChild(item);
    });
}

async function loadLists() {
    if (!supabase) {
        renderList(scamList, [], "Supabase is not configured");
        renderList(safeList, [], "Supabase is not configured");
        renderList(otherList, [], "Supabase is not configured");
        setResult("Supabase is not configured yet. Add the public env vars before using the live lists.", "neutral");
        return;
    }

    const [scamResponse, safeResponse, otherResponse] = await Promise.all([
        supabase.from("scam_phones").select("phone,label").order("created_at", {ascending: false}).limit(5),
        supabase.from("safe_phones").select("phone,label").order("created_at", {ascending: false}).limit(5),
        supabase.from("other_phones").select("phone,label").order("created_at", {ascending: false}).limit(5)
    ]);

    if (scamResponse.error || safeResponse.error || otherResponse.error) {
        setResult("Supabase tables are not ready yet. Run the schema file first.", "neutral");
        return;
    }

    renderList(scamList, scamResponse.data, "No scam numbers yet");
    renderList(safeList, safeResponse.data, "No safe numbers yet");
    renderList(otherList, otherResponse.data, "No other numbers yet");
}

async function findPhone(phone) {
    if (!supabase) {
        return {status: "unknown", row: null};
    }

    const [scamResponse, safeResponse, otherResponse] = await Promise.all([
        supabase.from("scam_phones").select("phone,label,notes").eq("phone", phone).maybeSingle(),
        supabase.from("safe_phones").select("phone,label,notes").eq("phone", phone).maybeSingle(),
        supabase.from("other_phones").select("phone,label,notes").eq("phone", phone).maybeSingle()
    ]);

    if (scamResponse.error || safeResponse.error || otherResponse.error) {
        throw new Error("Unable to query phone tables.");
    }

    if (scamResponse.data) {
        return {status: "scam", row: scamResponse.data};
    }

    if (safeResponse.data) {
        return {status: "safe", row: safeResponse.data};
    }

    if (otherResponse.data) {
        return {status: "other", row: otherResponse.data};
    }

    return {status: "unknown", row: null};
}

window.checkPhone = async () => {
    const phone = normalizePhone(phoneInput.value);

    if (!phone) {
        setResult("Enter a valid phone number first.", "neutral");
        return;
    }

    try {
        const found = await findPhone(phone);

        if (found.status === "scam") {
            setResult(`Scam number found: ${found.row.phone}`, "scam");
            return;
        }

        if (found.status === "safe") {
            setResult(`Safe number found: ${found.row.phone}`, "safe");
            return;
        }

        if (found.status === "other") {
            setResult(`Other category found: ${found.row.phone}`, "other");
            return;
        }

        setResult(`No match yet for ${phone}. You can add it below.`, "neutral");
    } catch (error) {
        setResult(error.message, "neutral");
    }
};

window.markPhone = async (category) => {
    const phone = normalizePhone(phoneInput.value);
    const notes = notesInput.value.trim();

    if (!phone) {
        setResult("Enter a valid phone number first.", "neutral");
        return;
    }

    if (!supabase) {
        setResult("Supabase is not configured. The phone directory cannot be updated yet.", "neutral");
        return;
    }

    try {
        const directoryResponse = await supabase.from("phone_directory").upsert({
            phone,
            category,
            label: category === "scam" ? "Scam phone" : category === "safe" ? "Safe phone" : "Other phone",
            notes,
            source: "web app",
            verified: true
        }, {onConflict: "phone"});

        if (directoryResponse.error) {
            throw directoryResponse.error;
        }

        const reportResponse = await supabase.from("phone_reports").insert({
            phone,
            verdict: category,
            notes,
            submitted_by: null
        });

        if (reportResponse.error) {
            throw reportResponse.error;
        }

        setResult(`Saved ${phone} as ${category}.`, category);
        notesInput.value = "";
        await loadLists();
    } catch (error) {
        setResult(error.message, "neutral");
    }
};

await loadLists();
