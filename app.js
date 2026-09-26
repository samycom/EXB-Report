let reportData = [];

/* =========================================================
   SUPABASE ONLINE STORAGE / AUTH
   Paste your Supabase Project URL and Publishable Key below.
   Never put a Supabase secret/service key here.
========================================================= */
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE";
const SUPABASE_READY =
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("PASTE_YOUR") &&
    !SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR");

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let supervisorReports = [];

if (SUPABASE_READY) {
    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
}

function normalizeUserId(v) {
    return String(v || "").trim().replace(/\s+/g, "");
}

function syntheticEmail(userId) {
    return normalizeUserId(userId).toLowerCase() + "@excessbaggage.local";
}

function setAuthMessage(msg, ok=false) {
    const el=document.getElementById("authMsg");
    el.textContent=msg||"";
    el.style.color=ok ? "var(--green)" : "var(--red)";
}

function showAuthMode(mode) {
    const reg=mode==="register";
    document.getElementById("loginTab").classList.toggle("active",!reg);
    document.getElementById("registerTab").classList.toggle("active",reg);
    document.getElementById("authConfirmWrap").classList.toggle("hidden",!reg);
    document.getElementById("authAction").textContent=reg ? "Create Account" : "Sign In";
    document.getElementById("authPassword").autocomplete=reg ? "new-password" : "current-password";
    setAuthMessage("");
}

async function handleAuth() {
    if (!SUPABASE_READY) {
        setAuthMessage("Supabase is not configured yet. Open the setup guide included in this ZIP and add your Project URL and Publishable Key.");
        return;
    }
    const userId=normalizeUserId(document.getElementById("authUserId").value);
    const password=document.getElementById("authPassword").value;
    const isRegister=!document.getElementById("authConfirmWrap").classList.contains("hidden");
    if(!userId || !password){ setAuthMessage("Please enter User ID and password."); return; }
    if(!/^[A-Za-z0-9_-]{3,30}$/.test(userId)){ setAuthMessage("User ID must be 3–30 characters using letters, numbers, _ or -."); return; }
    if(password.length < 6){ setAuthMessage("Password must be at least 6 characters."); return; }

    if(isRegister){
        const p2=document.getElementById("authPassword2").value;
        if(password!==p2){ setAuthMessage("Passwords do not match."); return; }
        setAuthMessage("Creating account...",true);
        const {data,error}=await supabaseClient.auth.signUp({
            email:syntheticEmail(userId), password,
            options:{data:{user_code:userId, role:"user"}}
        });
        if(error){ setAuthMessage(error.message); return; }
        if(data.session){
            await finishLogin(data.session.user);
        } else {
            setAuthMessage("Account created. If Email Confirmation is enabled in Supabase, disable it for this ID/password login, then sign in again.",true);
        }
    } else {
        setAuthMessage("Signing in...",true);
        const {data,error}=await supabaseClient.auth.signInWithPassword({email:syntheticEmail(userId),password});
        if(error){ setAuthMessage(error.message); return; }
        await finishLogin(data.user);
    }
}

async function finishLogin(user) {
    currentUser=user;
    const {data,error}=await supabaseClient.from("profiles").select("id,user_code,role").eq("id",user.id).single();
    if(error){ setAuthMessage("Login succeeded, but the user profile could not be loaded. Run the SQL setup included in this ZIP."); return; }
    currentProfile=data;
    document.getElementById("authScreen").style.display="none";
    if(data.role==="supervisor"){
        document.getElementById("mainApp").style.display="none";
        document.getElementById("supervisorPanel").style.display="block";
        document.getElementById("supervisorIdentity").textContent="Supervisor: "+data.user_code;
        await loadSupervisorReports();
    } else {
        document.getElementById("supervisorPanel").style.display="none";
        document.getElementById("mainApp").style.display="flex";
        document.querySelector(".user-pill strong")?.replaceChildren(document.createTextNode(data.user_code));
        await loadMyReports();
    }
}

async function loadSession() {
    if(!SUPABASE_READY){
        document.getElementById("authScreen").style.display="flex";
        return;
    }
    const {data}=await supabaseClient.auth.getSession();
    if(data.session) await finishLogin(data.session.user);
}

async function loadMyReports() {
    if(!supabaseClient || !currentUser) return;
    const {data,error}=await supabaseClient.from("reports")
        .select("id,emd_number,issue_date,sign_in,created_at,report_data")
        .eq("user_id",currentUser.id)
        .order("created_at",{ascending:true});
    if(error){ alert("Could not load your online reports: "+error.message); return; }
    reportData=(data||[]).map(r=>r.report_data);
    processedEMDs.clear();
    reportData.forEach(r=>{ if(r["EMD Number"]) processedEMDs.add(r["EMD Number"]); });
    displayReport();
}

async function saveReportsToCloud(records) {
    if(!supabaseClient || !currentUser || !records.length) return;
    const rows=records.map(r=>({
        user_id:currentUser.id,
        emd_number:r["EMD Number"],
        issue_date:r["Issue Date"] || null,
        sign_in:r["Sign In"] || null,
        report_data:r
    }));
    const {error}=await supabaseClient.from("reports").upsert(rows,{onConflict:"user_id,emd_number"});
    if(error){
        console.error(error);
        alert("The report was created on screen, but could not be saved online: "+error.message);
    }
}

async function clearAllCloudReports() {
    if(!supabaseClient || !currentUser) return;
    const {error}=await supabaseClient.from("reports").delete().eq("user_id",currentUser.id);
    if(error) alert("Could not delete online reports: "+error.message);
}

async function logout() {
    if(supabaseClient) await supabaseClient.auth.signOut();
    currentUser=null; currentProfile=null; reportData=[]; processedEMDs.clear();
    document.getElementById("mainApp").style.display="none";
    document.getElementById("supervisorPanel").style.display="none";
    document.getElementById("authScreen").style.display="flex";
    document.getElementById("authUserId").value="";
    document.getElementById("authPassword").value="";
    showAuthMode("login");
}

async function loadSupervisorReports() {
    if(!supabaseClient || !currentProfile || currentProfile.role!=="supervisor") return;
    const {data,error}=await supabaseClient.from("reports")
      .select("id,user_id,emd_number,issue_date,sign_in,created_at,report_data,profiles(user_code)")
      .order("created_at",{ascending:false});
    if(error){ alert("Could not load supervisor reports: "+error.message); return; }
    supervisorReports=data||[];
    renderSupervisorReports();
}

function renderSupervisorReports() {
    const q=(document.getElementById("supSearch")?.value||"").toLowerCase().trim();
    const d=(document.getElementById("supDate")?.value||"").toLowerCase().trim();
    const rows=supervisorReports.filter(r=>{
        const x=r.report_data||{};
        const userCode=(r.profiles?.user_code||"").toLowerCase();
        const hay=[userCode,r.emd_number,r.issue_date,r.sign_in,x["Connected Ticket"],x["FOP"]].join(" ").toLowerCase();
        return (!q || hay.includes(q)) && (!d || String(r.issue_date||"").toLowerCase().includes(d));
    });
    const body=document.getElementById("supervisorBody");
    body.innerHTML="";
    rows.forEach(r=>{
        const x=r.report_data||{};
        const tr=document.createElement("tr");
        const vals=[
            r.issue_date||x["Issue Date"]||"", r.profiles?.user_code||"", r.sign_in||x["Sign In"]||"",
            x["Connected Ticket"]||"", r.emd_number||x["EMD Number"]||"", x["USD Rate"]||"",
            x["FOP"]||"", x["Baggage Qty"]||"", x["Rate per KG"]||"",
            x["Cash Collected ETB"]||"", x["Cash Collected USD"]||""
        ];
        vals.forEach(v=>{const td=document.createElement("td");td.textContent=String(v);tr.appendChild(td)});
        body.appendChild(tr);
    });
    const totalETB=rows.reduce((a,r)=>a+(parseFloat(r.report_data?.["Cash Collected ETB"])||0),0);
    const totalUSD=rows.reduce((a,r)=>a+(parseFloat(r.report_data?.["Cash Collected USD"])||0),0);
    document.getElementById("supervisorSummary").innerHTML=
      `<div class="metric"><div class="label">Reports</div><div class="value">${rows.length}</div></div>
       <div class="metric primary"><div class="label">Collected ETB</div><div class="value">ETB ${formatNumber(totalETB)}</div></div>
       <div class="metric success"><div class="label">Collected USD</div><div class="value">USD ${formatNumber(totalUSD)}</div></div>`;
}

function downloadSupervisorExcel() {
    const q=(document.getElementById("supSearch")?.value||"").toLowerCase().trim();
    const d=(document.getElementById("supDate")?.value||"").toLowerCase().trim();
    const rows=supervisorReports.filter(r=>{
        const x=r.report_data||{}; const userCode=(r.profiles?.user_code||"").toLowerCase();
        const hay=[userCode,r.emd_number,r.issue_date,r.sign_in,x["Connected Ticket"],x["FOP"]].join(" ").toLowerCase();
        return (!q || hay.includes(q)) && (!d || String(r.issue_date||"").toLowerCase().includes(d));
    });
    if(!rows.length){alert("No supervisor reports match the current filter.");return;}
    const exportData=rows.map(r=>{
        const x=r.report_data||{};
        return {"Issue Date":x["Issue Date"],"User ID":r.profiles?.user_code||"","Sign In":x["Sign In"],
          "Connected Ticket":x["Connected Ticket"],"EMD Number":x["EMD Number"],"USD Rate":x["USD Rate"],
          "Form of Payment":x["FOP"],"Weight in KG":x["Baggage Qty"],"Rate per KG (ETB)":x["Rate per KG"],
          "Amount (ETB)":x["Cash Collected ETB"],"Exchange Rate (USD Rate)":x["USD Rate"],"Amount in USD":x["Cash Collected USD"]};
    });
    const wb=XLSX.utils.book_new(); const ws=XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb,ws,"All Reports"); XLSX.writeFile(wb,"Excess_Baggage_Supervisor_Report.xlsx");
}


const processedEMDs = new Set();

/*
=========================================================
GENERATE REPORT
=========================================================
*/

function generateReport() {

    let input =
        document.getElementById("emdInput").value.trim();

    const signIn =
        document.getElementById("signIn").value.trim();

    const rateInput =
        document.getElementById("usdRate").value.trim();

    const usdRate =
        parseFloat(rateInput);

    const ratePerKgInput =
        document.getElementById("ratePerKg").value.trim();

    const ratePerKg =
        ratePerKgInput === "" ? NaN : parseFloat(ratePerKgInput);

    const status =
        document.getElementById("status");

    const duplicateMessage =
        document.getElementById("duplicateMessage");

    const warningMessage =
        document.getElementById("warningMessage");

    /*
    VALIDATE SIGN
    */

    if (!signIn) {

        alert("Please enter Sign In first.");

        document.getElementById("signIn").focus();

        return;
    }

    /*
    VALIDATE INPUT
    */

    if (!input) {

        alert("Please paste EMD data first.");

        return;
    }

    /*
    RATE PER KG IS REQUIRED
    */

    if (
        ratePerKgInput === "" ||
        isNaN(ratePerKg) ||
        ratePerKg < 0
    ) {

        alert(
            "Please enter a valid Rate per KG.\n\n" +
            "Example: 25.00 means 25 ETB per KG."
        );

        document.getElementById("ratePerKg").focus();

        return;
    }

    /*
    USD RATE IS REQUIRED
    */

    if (
        rateInput === "" ||
        isNaN(usdRate) ||
        usdRate <= 0
    ) {

        alert(
            "Please enter a valid USD to ETB rate.\n\n" +
            "Example: 147.50 means 1 USD = 147.50 ETB."
        );

        document.getElementById("usdRate").focus();

        return;
    }

    let newlyAdded = 0;
    const cloudRecords = [];

    const duplicateEMDs = [];

    const invalidEMDs = [];

    /*
    SPLIT EMD RECORDS
    */

    /*
    SPLIT EMD RECORDS - SUPPORTS BOTH FORMATS

    The newer EMD format may start with a command/header such as
    WY*D¥T before the EMD number, so the EMD number is not always
    at the beginning of the line. Find each 13-digit EMD number and
    use it as the beginning of each record.
    */
    // Normalize copied airline-terminal text first. Some terminals use NBSPs
    // and the yen-like separator (¥) in WY*D¥T..., which can otherwise make
    // a strict header regex miss the EMD.
    input = input
        .replace(/\u00A0/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    // The airline terminal format can have the EMD number in several places:
    //   0714404076417 ...
    //   WY*D¥T0714404076417
    //   EMD - ELECTRONIC MISCELLANEOUS DOCUMENT ... TKT:0714404076417
    // The real pasted format supplied by the user starts with the EMD title,
    // so record boundaries must NOT depend on the 13-digit number being first.
    const emdStarts = [];
    const emdHeaderRegex = /^\s*EMD\s*-\s*ELECTRONIC\s+MISCELLANEOUS\s+DOCUMENT\b/gmi;
    const terminalHeaderRegex = /^\s*WY\*D[^\n]*?(?:T\s*)?(071\d{10})\b/gmi;
    const numberAtLineStartRegex = /^\s*(071\d{10})\b/gmi;

    let startMatch;
    while ((startMatch = emdHeaderRegex.exec(input)) !== null) {
        emdStarts.push(startMatch.index);
    }

    // If the standard EMD title was not found, support the other terminal
    // formats used by the application.
    if (emdStarts.length === 0) {
        while ((startMatch = terminalHeaderRegex.exec(input)) !== null) {
            emdStarts.push(startMatch.index);
        }
    }

    if (emdStarts.length === 0) {
        while ((startMatch = numberAtLineStartRegex.exec(input)) !== null) {
            emdStarts.push(startMatch.index);
        }
    }

    // As a final fallback, a standalone TKT line identifies an EMD record.
    if (emdStarts.length === 0) {
        const tktLineRegex = /^\s*TKT\s*:\s*071\d{10}\b/gmi;
        while ((startMatch = tktLineRegex.exec(input)) !== null) {
            emdStarts.push(startMatch.index);
        }
    }

    const emdBlocks = emdStarts.map((start, index) =>
        input.slice(
            start,
            index + 1 < emdStarts.length
                ? emdStarts[index + 1]
                : input.length
        )
    );

    emdBlocks.forEach(block => {

        block = block.trim();

        if (!block) {
            return;
        }

        /*
        EMD NUMBER
        */

        const emdMatch =
            block.match(/^\s*(?:WY\*D[^\n]*?T\s*)?(071\d{10})\b/im) ||
            block.match(/\bTKT\s*:\s*(071\d{10})\b/i);

        // In the standard EMD terminal format, TKT is the EMD number.
        const emdNumber =
            emdMatch ? emdMatch[1] : "";

        if (!emdNumber) {
            return;
        }

        /*
        PASSENGER NAME
        */

        const nameMatch =
            block.match(/NAME\s*[-:]\s*([^\r\n]+)/i);

        const passengerName =
            nameMatch
                ? nameMatch[1].trim()
                : "";

        /*
        ISSUE DATE
        */

        const issueDateMatch =
            block.match(
                /DATE OF ISSUE\s*[-:]\s*(\d{1,2}[A-Z]{3}\d{2})/i
            ) ||
            block.match(
                /ISSUED\s*[:\-]\s*(\d{1,2}[A-Z]{3}\d{2})/i
            );

        const issueDate =
            issueDateMatch
                ? issueDateMatch[1].toUpperCase()
                : "";

        /*
        PNR
        */

        const pnrMatch =
            block.match(/PNR\s*[-:]\s*([A-Z0-9]+)/i);

        const pnr =
            pnrMatch
                ? pnrMatch[1].toUpperCase()
                : "";

        /*
        BASE VALUE
        */

        const baseMatch =
            block.match(
                /BASE VALUE\s+([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/i
            ) ||
            block.match(
                /COST\s*:\s*([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/i
            );

        const baseCurrency =
            baseMatch
                ? baseMatch[1].toUpperCase()
                : "";

        const baseValue =
            baseMatch
                ? parseFloat(
                    baseMatch[2].replace(/,/g, "")
                  )
                : 0;

        /*
        TOTAL VALUE
        */

        const totalMatch =
            block.match(
                /TOTAL VALUE\s+([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/i
            ) ||
            block.match(
                /TOTAL\s*:\s*([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/i
            );

        // Alternate format uses: AMT: ETB 1080
        const amtMatch =
            block.match(
                /AMT\s*:\s*([A-Z]{3})\s+([\d,]+(?:\.\d+)?)/i
            );

        const currency =
            totalMatch
                ? totalMatch[1].toUpperCase()
                : (baseCurrency || (amtMatch ? amtMatch[1].toUpperCase() : ""));

        // For the standard raw EMD format, TOTAL is the final amount.
        // If TOTAL is absent, AMT is the EMD amount and is used as the total.
        const totalValue =
            totalMatch
                ? parseFloat(
                    totalMatch[2].replace(/,/g, "")
                  )
                : (amtMatch
                    ? parseFloat(amtMatch[2].replace(/,/g, ""))
                    : 0);

        /*
        FORM OF PAYMENT
        */

        const fopMatch =
            block.match(
                /FOP-\s*([A-Z0-9]+)\s+([\d,]+(?:\.\d+)?)/i
            ) ||
            block.match(
                /FOP\s*:\s*([A-Z0-9]+)(?:\s+([\d,]+(?:\.\d+)?))?/i
            );

        const fop =
            fopMatch
                ? fopMatch[1].toUpperCase()
                : "";

        let fopAmount =
            fopMatch && fopMatch[2]
                ? parseFloat(
                    fopMatch[2].replace(/,/g, "")
                  )
                : 0;

        /*
        ALTERNATE EMD FORMAT
        Example: FOP:CASH ... AMT: ETB 1080
        */
        if (fop && fop === "CASH" && !fopAmount && amtMatch) {
            fopAmount = parseFloat(amtMatch[2].replace(/,/g, ""));
        }

        /*
        ONLY CA IS CASH
        */

        let originalCash = 0;

        if (fop === "CA" || fop === "CASH") {
            originalCash = fopAmount;
        }

        /*
        CASH COLLECTED ETB
        =========================================

        The report uses the EMD TOTAL amount as the cash collected.
        If the EMD total is already ETB, use it directly. If the
        EMD is in USD, convert it using the entered USD → ETB rate.
        */

        let cashCollectedETB = 0;

        if (currency === "ETB") {

            cashCollectedETB = totalValue;

        } else if (currency === "USD") {

            cashCollectedETB = totalValue * usdRate;

        } else if (totalValue > 0 && (fop === "CA" || fop === "CASH")) {

            cashCollectedETB = totalValue;

        }

        /*
        CASH COLLECTED USD
        =========================================

        CASH COLLECTED USD = CASH COLLECTED ETB ÷ USD RATE
        */

        let cashCollectedUSD = 0;

        cashCollectedUSD =
            usdRate > 0
                ? cashCollectedETB / usdRate
                : 0;

        /*
        CONNECTED TICKET
        */

        const connectedMatch =
            block.match(
                /ISSUED\s+IN\s+CONNECTION\s+WITH\s*[:\-]?\s*(071\d{10})/i
            ) ||
            block.match(
                /CONNECTION\s+WITH\s*[:\-]?\s*(071\d{10})/i
            );

        const connectedTicket =
            connectedMatch
                ? connectedMatch[1]
                : "";

        /*
        BAGGAGE QUANTITY / KG
        =========================================

        Baggage quantity is calculated from the ETB amount divided by
        the configured Rate per KG. For example, 1080 ETB ÷ 120 ETB/KG = 9 KG.
        The old raw QTY field is intentionally ignored because it may
        represent a terminal quantity/code rather than the actual KG
        calculation required by this report.
        */

        const baggageQty =
            ratePerKg > 0
                ? cashCollectedETB / ratePerKg
                : 0;

        /*
        DUPLICATE CHECK
        */

        if (processedEMDs.has(emdNumber)) {

            if (!duplicateEMDs.includes(emdNumber)) {
                duplicateEMDs.push(emdNumber);
            }

            return;
        }

        /*
        FOP VALIDATION
        */

        if (!fop) {

            invalidEMDs.push(
                emdNumber + " - FOP not found"
            );

        }

        /*
        SAVE EMD
        */

        processedEMDs.add(emdNumber);

        /*
        ADD RECORD
        */

        reportData.push({

            "No.": reportData.length + 1,

            "EMD Number": emdNumber,

            "Issue Date": issueDate,

            "Passenger Name": passengerName,

            "PNR": pnr,

            "Original Currency": currency,

            "Base Value": baseValue,

            "Total Value": totalValue,

            "FOP": fop,

            "Original Cash": originalCash,

            "USD Rate": usdRate,

            "Rate per KG": ratePerKg,

            "Baggage Qty": baggageQty,

            "Cash Collected ETB": cashCollectedETB,

            "Cash Collected USD": cashCollectedUSD,

            "Sign In": signIn,

            "Connected Ticket": connectedTicket

        });

        cloudRecords.push(reportData[reportData.length - 1]);
        newlyAdded++;

    });

    /*
    DISPLAY REPORT
    */

    displayReport();

    if (cloudRecords.length) {
        saveReportsToCloud(cloudRecords);
    }

    /*
    CLEAR INPUT
    */

    if (newlyAdded > 0) {

        document.getElementById("emdInput").value = "";

        status.textContent =
            newlyAdded +
            " new EMD(s) added successfully. " +
            "Total report records: " +
            reportData.length;

    } else {

        status.textContent =
            "No new EMDs were added.";

    }

    /*
    DUPLICATES
    */

    if (duplicateEMDs.length > 0) {

        duplicateMessage.style.display = "block";

        duplicateMessage.innerHTML =
            "<strong>⚠ Duplicate EMD(s) Found:</strong>" +
            "<br><br>" +
            duplicateEMDs.join("<br>") +
            "<br><br>" +
            "Duplicate EMDs were not added.";

    } else {

        duplicateMessage.style.display = "none";

        duplicateMessage.innerHTML = "";

    }

    /*
    WARNINGS
    */

    if (invalidEMDs.length > 0) {

        warningMessage.style.display = "block";

        warningMessage.innerHTML =
            "<strong>⚠ Records requiring attention:</strong>" +
            "<br><br>" +
            invalidEMDs.join("<br>");

    } else {

        warningMessage.style.display = "none";

        warningMessage.innerHTML = "";

    }

}

/*
=========================================================
DISPLAY REPORT
=========================================================
*/

function displayReport() {

    const tbody =
        document.getElementById("reportBody");

    tbody.innerHTML = "";

    reportData.forEach((item, index) => {

        item["No."] = index + 1;

        const row =
            document.createElement("tr");

        row.innerHTML = `

            <td>
                ${escapeHtml(item["Issue Date"])}
            </td>

            <td class="sign-cell">
                ${escapeHtml(item["Sign In"])}
            </td>

            <td>
                ${escapeHtml(item["Connected Ticket"])}
            </td>

            <td>
                ${escapeHtml(item["EMD Number"])}
            </td>

            <td class="rate">
                ${formatNumber(item["USD Rate"])}
            </td>

            <td>
                ${escapeHtml(item["FOP"] || "")}
            </td>

            <td>
                ${formatNumber(item["Baggage Qty"])}
            </td>

            <td class="rate">
                ${formatNumber(item["Rate per KG"])}
            </td>

            <td class="cash">
                ${formatNumber(item["Cash Collected ETB"])}
            </td>

            <td class="rate">
                ${formatNumber(item["USD Rate"])}
            </td>

            <td class="usd">
                USD ${formatNumber(item["Cash Collected USD"])}
            </td>

        `;

        tbody.appendChild(row);

    });

    updateSummary();
}

/*
=========================================================
UPDATE SUMMARY
=========================================================
*/

function updateSummary() {

    let totalETB = 0;

    let totalUSDOriginal = 0;

    let totalETBOriginal = 0;

    let totalCashUSD = 0;

    reportData.forEach(item => {

        const currency =
            item["Original Currency"];

        const cash =
            parseFloat(item["Original Cash"]) || 0;

        const cashETB =
            parseFloat(item["Cash Collected ETB"]) || 0;

        const cashUSD =
            parseFloat(item["Cash Collected USD"]) || 0;

        totalETB += cashETB;

        totalCashUSD += cashUSD;

        if (currency === "USD") {

            totalUSDOriginal += cash;

        }

        if (currency === "ETB") {

            totalETBOriginal += cash;

        }

    });

    document.getElementById("summary").innerHTML = `
  <div class="metric">
    <div class="label">Total EMDs</div>
    <div class="value">${reportData.length}</div>
  </div>
  <div class="metric">
    <div class="label">Original USD Cash</div>
    <div class="value">USD ${formatNumber(totalUSDOriginal)}</div>
  </div>
  <div class="metric">
    <div class="label">Original ETB Cash</div>
    <div class="value">ETB ${formatNumber(totalETBOriginal)}</div>
  </div>
  <div class="metric primary">
    <div class="label">Collected ETB</div>
    <div class="value">ETB ${formatNumber(totalETB)}</div>
  </div>
  <div class="metric success">
    <div class="label">Collected USD</div>
    <div class="value">USD ${formatNumber(totalCashUSD)}</div>
  </div>
`;
}

/*
=========================================================
NUMBER FORMAT
=========================================================
*/

function formatNumber(value) {

    const number =
        parseFloat(value) || 0;

    return number.toLocaleString(
        "en-US",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}

/*
=========================================================
ESCAPE HTML
=========================================================
*/

function escapeHtml(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/*
=========================================================
DOWNLOAD EXCEL
=========================================================
*/

function downloadExcel() {

    if (reportData.length === 0) {

        alert("No EMD records available.");

        return;
    }

    /*
    UPDATE SEQUENCE
    */

    reportData.forEach((item, index) => {

        item["No."] = index + 1;

    });

    /*
    MAIN REPORT SHEET
    */

    // Export the report in the same order shown in the UI.
    // Internal parsing fields are intentionally excluded.
    const exportData = reportData.map(item => ({
        "Issue Date": item["Issue Date"],
        "Sign In": item["Sign In"],
        "Connected Ticket": item["Connected Ticket"],
        "EMD Number": item["EMD Number"],
        "USD Rate": item["USD Rate"],
        "Form of Payment": item["FOP"],
        "Weight in KG": item["Baggage Qty"],
        "Rate per KG (ETB)": item["Rate per KG"],
        "Amount (ETB)": item["Cash Collected ETB"],
        "Exchange Rate (USD Rate)": item["USD Rate"],
        "Amount in USD": item["Cash Collected USD"]
    }));

    const worksheet =
        XLSX.utils.json_to_sheet(exportData);

    const workbook =
        XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Excess Baggage Report"
    );

    /*
    COLUMN WIDTHS
    */

    worksheet["!cols"] = [
        { wch: 14 }, // Issue Date
        { wch: 18 }, // Sign In
        { wch: 22 }, // Connected Ticket
        { wch: 18 }, // EMD Number
        { wch: 15 }, // Weight in KG
        { wch: 18 }, // Rate per KG (ETB)
        { wch: 15 }, // Amount (ETB)
        { wch: 24 }, // Exchange Rate (USD Rate)
        { wch: 16 }  // Amount in USD
    ];

    /*
    NUMBER FORMATTING
    */

    reportData.forEach((item, rowIndex) => {

        const excelRow = rowIndex + 2;

        const numberColumns = [
            "E", // Weight in KG
            "F", // Rate per KG (ETB)
            "G", // Amount (ETB)
            "H", // Exchange Rate (USD Rate)
            "I"  // Amount in USD
        ];

        numberColumns.forEach(column => {

            const cell =
                worksheet[column + excelRow];

            if (cell) {

                cell.t = "n";

                cell.z = '#,##0.00';

            }

        });

    });

    /*
    CALCULATE TOTALS
    */

    let totalETB = 0;

    let totalUSDOriginal = 0;

    let totalOriginalETB = 0;

    let totalCashUSD = 0;

    reportData.forEach(item => {

        totalETB +=
            parseFloat(
                item["Cash Collected ETB"]
            ) || 0;

        totalCashUSD +=
            parseFloat(
                item["Cash Collected USD"]
            ) || 0;

        if (
            item["Original Currency"] === "USD"
        ) {

            totalUSDOriginal +=
                parseFloat(
                    item["Original Cash"]
                ) || 0;

        }

        if (
            item["Original Currency"] === "ETB"
        ) {

            totalOriginalETB +=
                parseFloat(
                    item["Original Cash"]
                ) || 0;

        }

    });

    /*
    ADD TOTAL ROW TO MAIN REPORT
    */

    const totalRow = [
        "",
        "",
        "",
        "",
        "",
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        totalETB,
        totalCashUSD,
        "",
        ""
    ];

    XLSX.utils.sheet_add_aoa(
        worksheet,
        [totalRow],
        {
            origin: -1
        }
    );

    /*
    FORMAT TOTAL ROW
    */

    const totalExcelRow =
        reportData.length + 2;

    worksheet["L" + totalExcelRow].z =
        '#,##0.00';

    worksheet["M" + totalExcelRow].z =
        '#,##0.00';

    /*
    SUMMARY SHEET
    */

    const usdRate =
        parseFloat(
            document.getElementById("usdRate").value
        ) || 0;

    const summaryData = [

        {
            "Description":
                "TOTAL EMD RECORDS",

            "Value":
                reportData.length
        },

        {
            "Description":
                "USD TO ETB RATE USED",

            "Value":
                usdRate
        },

        {
            "Description":
                "ORIGINAL USD CASH",

            "Value":
                totalUSDOriginal
        },

        {
            "Description":
                "ORIGINAL ETB CASH",

            "Value":
                totalOriginalETB
        },

        {
            "Description":
                "TOTAL CASH COLLECTED ETB",

            "Value":
                totalETB
        },

        {
            "Description":
                "TOTAL CASH COLLECTED USD",

            "Value":
                totalCashUSD
        }

    ];

    /*
    SIGN SUMMARY
    */

    const signCounts = {};

    const signUSDValues = {};

    reportData.forEach(item => {

        const sign =
            item["Sign In"] || "NOT ENTERED";

        if (!signCounts[sign]) {

            signCounts[sign] = 0;

            signUSDValues[sign] = 0;

        }

        signCounts[sign]++;

        signUSDValues[sign] +=
            parseFloat(
                item["Cash Collected USD"]
            ) || 0;

    });

    Object.keys(signCounts).forEach(sign => {

        summaryData.push({

            "Description":
                "EMDs - Sign In " + sign,

            "Value":
                signCounts[sign]

        });

        summaryData.push({

            "Description":
                "Cash Collected USD - Sign In " + sign,

            "Value":
                signUSDValues[sign]

        });

    });

    /*
    CREATE SUMMARY SHEET
    */

    const summarySheet =
        XLSX.utils.json_to_sheet(summaryData);

    summarySheet["!cols"] = [
        { wch: 45 },
        { wch: 25 }
    ];

    /*
    FORMAT SUMMARY NUMBERS
    */

    for (
        let row = 2;
        row <= summaryData.length + 1;
        row++
    ) {

        if (summarySheet["B" + row]) {

            summarySheet["B" + row].z =
                '#,##0.00';

        }

    }

    XLSX.utils.book_append_sheet(
        workbook,
        summarySheet,
        "Cash Summary"
    );

    /*
    USD SUMMARY SHEET
    */

    const usdRecords =
        reportData.filter(
            item =>
                item["Cash Collected USD"] > 0
        );

    const usdSummaryData =
        usdRecords.map(item => ({

            "EMD Number":
                item["EMD Number"],


            "Original Currency":
                item["Original Currency"],

            "Original Cash":
                item["Original Cash"],

            "USD Rate":
                item["USD Rate"],

            "Cash Collected ETB":
                item["Cash Collected ETB"],

            "Cash Collected USD":
                item["Cash Collected USD"],

            "Sign In":
                item["Sign In"]

        }));

    /*
    USD TOTAL ROW
    */

    usdSummaryData.push({

        "EMD Number": "",


        "Original Currency": "",

        "Original Cash": "",

        "USD Rate": "",

        "Cash Collected ETB":
            totalETB,

        "Cash Collected USD":
            totalCashUSD,

        "Sign In": "TOTAL"

    });

    const usdSheet =
        XLSX.utils.json_to_sheet(
            usdSummaryData
        );

    usdSheet["!cols"] = [

        { wch: 18 },
        { wch: 30 },
        { wch: 18 },
        { wch: 18 },
        { wch: 15 },
        { wch: 22 },
        { wch: 22 },
        { wch: 15 }

    ];

    /*
    FORMAT USD SHEET
    */

    for (
        let row = 2;
        row <= usdSummaryData.length + 1;
        row++
    ) {

        ["D", "E", "F", "G"].forEach(column => {

            if (usdSheet[column + row]) {

                usdSheet[column + row].z =
                    '#,##0.00';

            }

        });

    }

    XLSX.utils.book_append_sheet(
        workbook,
        usdSheet,
        "USD Summary"
    );

    /*
    DOWNLOAD
    */

    XLSX.writeFile(
        workbook,
        "Excess_Baggage_USD_Report.xlsx"
    );

}

/*
=========================================================
CLEAR INPUT
=========================================================
*/

function clearInput() {

    document.getElementById("emdInput").value = "";

}

/*
=========================================================
CLEAR ALL
=========================================================
*/

function clearAll() {

    if (
        !confirm(
            "Are you sure you want to delete the entire EMD report?"
        )
    ) {
        return;
    }

    reportData = [];

    processedEMDs.clear();

    clearAllCloudReports();

    document.getElementById("emdInput").value = "";

    document.getElementById("signIn").value = "";

    document.getElementById("usdRate").value = "";

    document.getElementById("reportBody").innerHTML = "";

    document.getElementById("status").textContent = "";

    document.getElementById("summary").innerHTML = `
        <div class="metric"><div class="label">Total EMDs</div><div class="value">0</div></div>
        <div class="metric"><div class="label">Original USD Cash</div><div class="value">USD 0.00</div></div>
        <div class="metric"><div class="label">Original ETB Cash</div><div class="value">ETB 0.00</div></div>
        <div class="metric"><div class="label">Collected ETB</div><div class="value">ETB 0.00</div></div>
        <div class="metric success"><div class="label">Collected USD</div><div class="value">USD 0.00</div></div>
    `;

    document.getElementById("duplicateMessage").style.display =
        "none";

    document.getElementById("duplicateMessage").innerHTML =
        "";

    document.getElementById("warningMessage").style.display =
        "none";

    document.getElementById("warningMessage").innerHTML =
        "";

}


document.addEventListener("DOMContentLoaded", async () => {
    if(!SUPABASE_READY){
        setAuthMessage("Setup required: add your Supabase URL and Publishable Key.");
    }
    await loadSession();
});
if (typeof supabaseClient !== "undefined" && supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if(event === "SIGNED_OUT") return;
        if(session && !currentUser) await finishLogin(session.user);
    });
}

