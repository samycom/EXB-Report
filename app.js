

let reportData = [];

/* =========================================================
   LOCAL STORAGE ACCOUNT / REPORT STORAGE
   Temporary offline version. Data stays in this browser only.
========================================================= */
const USERS_KEY = "excess_baggage_users_v1";
const REPORTS_KEY = "excess_baggage_reports_v1";
const SESSION_KEY = "excess_baggage_session_v1";
const GUEST_ID_KEY = "excess_baggage_guest_id_v1";

let currentUser = null;
let currentProfile = null;
let supervisorReports = [];

function normalizeUserId(v) {
    return String(v || "").trim().replace(/\s+/g, "");
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
    document.getElementById("recoverySetupWrap").classList.toggle("hidden",!reg);
    document.getElementById("forgotPasswordBtn").classList.toggle("hidden",reg);
    document.getElementById("authAction").textContent=reg ? "Create Account" : "Sign In";
    document.getElementById("authPassword").autocomplete=reg ? "new-password" : "current-password";
    setAuthMessage("");
}

function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); }
    catch(e) { return {}; }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function getAllLocalReports() {
    try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || "{}"); }
    catch(e) { return {}; }
}

function saveAllLocalReports(all) {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
}

async function hashPassword(password) {
    const data=new TextEncoder().encode(password);
    const hash=await crypto.subtle.digest("SHA-256",data);
    return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function normalizeRecoveryAnswer(answer) {
    return String(answer || "").trim().toLowerCase().replace(/\s+/g," ");
}

async function hashRecoveryAnswer(answer) {
    return hashPassword(normalizeRecoveryAnswer(answer));
}

function setRecoveryMessage(msg, ok=false) {
    const el=document.getElementById("recoveryMsg");
    el.textContent=msg||"";
    el.style.color=ok ? "var(--green)" : "var(--red)";
}

function openForgotPassword() {
    document.getElementById("forgotPasswordModal").classList.remove("hidden");
    document.getElementById("recoveryStep1").classList.remove("hidden");
    document.getElementById("recoveryStep2").classList.add("hidden");
    document.getElementById("recoveryUserId").value=document.getElementById("authUserId").value.trim();
    document.getElementById("recoveryAnswer").value="";
    document.getElementById("recoveryNewPassword").value="";
    document.getElementById("recoveryNewPassword2").value="";
    setRecoveryMessage("");
}

function closeForgotPassword() {
    document.getElementById("forgotPasswordModal").classList.add("hidden");
    setRecoveryMessage("");
}

function resetRecoveryModalStep() {
    document.getElementById("recoveryStep1").classList.remove("hidden");
    document.getElementById("recoveryStep2").classList.add("hidden");
    setRecoveryMessage("");
}

function findRecoveryQuestion() {
    const userId=normalizeUserId(document.getElementById("recoveryUserId").value);
    if(!userId){ setRecoveryMessage("Please enter your User ID."); return; }
    const users=getUsers();
    const user=users[userId.toLowerCase()];
    if(!user){ setRecoveryMessage("User ID not found."); return; }
    if(!user.recoveryQuestion || !user.recoveryAnswerHash){
        setRecoveryMessage("Password recovery has not been set up for this account.");
        return;
    }
    document.getElementById("recoveryQuestionText").textContent=user.recoveryQuestion;
    document.getElementById("recoveryStep1").classList.add("hidden");
    document.getElementById("recoveryStep2").classList.remove("hidden");
    setRecoveryMessage("");
}

async function resetPasswordWithRecovery() {
    const userId=normalizeUserId(document.getElementById("recoveryUserId").value);
    const answer=document.getElementById("recoveryAnswer").value;
    const p1=document.getElementById("recoveryNewPassword").value;
    const p2=document.getElementById("recoveryNewPassword2").value;
    const users=getUsers();
    const key=userId.toLowerCase();
    const user=users[key];
    if(!user){ setRecoveryMessage("User ID not found."); return; }
    if(!answer){ setRecoveryMessage("Please enter your answer."); return; }
    if(p1.length < 6){ setRecoveryMessage("New password must be at least 6 characters."); return; }
    if(p1!==p2){ setRecoveryMessage("Passwords do not match."); return; }
    const answerHash=await hashRecoveryAnswer(answer);
    if(answerHash!==user.recoveryAnswerHash){ setRecoveryMessage("Incorrect answer."); return; }
    user.passwordHash=await hashPassword(p1);
    users[key]=user;
    saveUsers(users);
    setRecoveryMessage("Password reset successfully. You can now sign in.",true);
    setTimeout(()=>{
        closeForgotPassword();
        document.getElementById("authUserId").value=user.user_code;
        document.getElementById("authPassword").value="";
        showAuthMode("login");
        setAuthMessage("Password reset successfully. Please sign in.",true);
    },700);
}

async function ensureSupervisorAccount() {
    const users=getUsers();
    const oldKey="37888";
    const newKey="37111";
    // Convert the previous default supervisor to the new default account.
    if(users[oldKey] && users[oldKey].role==="supervisor" && !users[newKey]) {
        users[newKey]={user_code:"37111",passwordHash:await hashPassword("37111@"),role:"supervisor"};
        const all=getAllLocalReports();
        if(all[oldKey] && !all[newKey]) all[newKey]=all[oldKey];
        delete all[oldKey];
        saveAllLocalReports(all);
        delete users[oldKey];
        saveUsers(users);
    }
    if(!users[newKey]) {
        users[newKey]={user_code:"37111",passwordHash:await hashPassword("37111@"),role:"supervisor"};
        saveUsers(users);
    }
}

function getGuestId() {
    let id=localStorage.getItem(GUEST_ID_KEY);
    if(!id){
        id="guest_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8);
        localStorage.setItem(GUEST_ID_KEY,id);
    }
    return id;
}

async function continueAsGuest() {
    const guestId=getGuestId();
    localStorage.setItem(SESSION_KEY,"__GUEST__");
    currentUser={id:guestId,user_code:guestId};
    currentProfile={id:guestId,user_code:"Guest",role:"guest"};
    document.getElementById("authScreen").style.display="none";
    document.getElementById("supervisorPanel").style.display="none";
    document.getElementById("mainApp").style.display="flex";
    document.querySelector(".user-pill strong")?.replaceChildren(document.createTextNode("Guest"));
    loadMyReports();
}

async function handleAuth() {
    const userId=normalizeUserId(document.getElementById("authUserId").value);
    const password=document.getElementById("authPassword").value;
    const isRegister=!document.getElementById("authConfirmWrap").classList.contains("hidden");
    if(!userId || !password){ setAuthMessage("Please enter User ID and password."); return; }
    if(!/^[A-Za-z0-9_-]{3,30}$/.test(userId)){ setAuthMessage("User ID must be 3–30 characters using letters, numbers, _ or -."); return; }
    if(password.length < 6){ setAuthMessage("Password must be at least 6 characters."); return; }

    const users=getUsers();
    const key=userId.toLowerCase();

    if(isRegister){
        const p2=document.getElementById("authPassword2").value;
        const recoveryQuestion=document.getElementById("authRecoveryQuestion").value;
        const recoveryAnswer=document.getElementById("authRecoveryAnswer").value;
        if(password!==p2){ setAuthMessage("Passwords do not match."); return; }
        if(!recoveryQuestion){ setAuthMessage("Please select a security question."); return; }
        if(!normalizeRecoveryAnswer(recoveryAnswer)){ setAuthMessage("Please enter an answer to the security question."); return; }
        if(users[key]){ setAuthMessage("This User ID already exists. Please sign in."); return; }
        users[key]={user_code:userId,passwordHash:await hashPassword(password),recoveryQuestion,recoveryAnswerHash:await hashRecoveryAnswer(recoveryAnswer),role:"user"};
        saveUsers(users);
        setAuthMessage("registered Succesfully",true);
        document.getElementById("authPassword").value="";
        document.getElementById("authPassword2").value="";
        document.getElementById("authRecoveryQuestion").value="";
        document.getElementById("authRecoveryAnswer").value="";
        showAuthMode("login");
        setAuthMessage("registered Succesfully — please sign in.",true);
        return;
    }

    const user=users[key];
    if(!user){ setAuthMessage("User ID or password is incorrect."); return; }
    const passwordHash=await hashPassword(password);
    if(user.passwordHash!==passwordHash){ setAuthMessage("User ID or password is incorrect."); return; }
    localStorage.setItem(SESSION_KEY,user.user_code);
    await finishLogin(user);
}

async function finishLogin(user) {
    currentUser={id:user.user_code,user_code:user.user_code};
    currentProfile={id:user.user_code,user_code:user.user_code,role:user.role||"user"};
    document.getElementById("authScreen").style.display="none";
    if(currentProfile.role==="supervisor"){
        document.getElementById("mainApp").style.display="none";
        document.getElementById("supervisorPanel").style.display="block";
        document.getElementById("supervisorIdentity").textContent="Supervisor: "+currentProfile.user_code;
        loadSupervisorReports();
    } else {
        document.getElementById("supervisorPanel").style.display="none";
        document.getElementById("mainApp").style.display="flex";
        document.querySelector(".user-pill strong")?.replaceChildren(document.createTextNode(currentProfile.user_code));
        loadMyReports();
    }
}

async function loadSession() {
    await ensureSupervisorAccount();
    const sessionId=localStorage.getItem(SESSION_KEY);
    if(!sessionId){ document.getElementById("authScreen").style.display="flex"; return; }
    if(sessionId==="__GUEST__"){
        await continueAsGuest();
        return;
    }
    const users=getUsers();
    const user=users[String(sessionId).toLowerCase()];
    if(user) await finishLogin(user);
    else localStorage.removeItem(SESSION_KEY);
}

function loadMyReports() {
    if(!currentUser) return;
    const all=getAllLocalReports();
    reportData=Array.isArray(all[currentUser.user_code]) ? all[currentUser.user_code] : [];
    processedEMDs.clear();
    reportData.forEach(r=>{ if(r["EMD Number"]) processedEMDs.add(r["EMD Number"]); });
    displayReport();
}

function saveReportsToCloud(records) {
    if(!currentUser || !records.length) return;
    const all=getAllLocalReports();
    const key=currentUser.user_code;
    const existing=Array.isArray(all[key]) ? all[key] : [];
    const byEmd=new Map(existing.map(r=>[String(r["EMD Number"]||""),r]));
    records.forEach(r=>byEmd.set(String(r["EMD Number"]||""),r));
    all[key]=Array.from(byEmd.values());
    saveAllLocalReports(all);
}

function clearAllCloudReports() {
    if(!currentUser) return;
    const all=getAllLocalReports();
    delete all[currentUser.user_code];
    saveAllLocalReports(all);
}

function logout() {
    localStorage.removeItem(SESSION_KEY);
    currentUser=null; currentProfile=null; reportData=[]; processedEMDs.clear(); supervisorReports=[];
    document.getElementById("mainApp").style.display="none";
    document.getElementById("supervisorPanel").style.display="none";
    document.getElementById("authScreen").style.display="flex";
    document.getElementById("authUserId").value="";
    document.getElementById("authPassword").value="";
    document.getElementById("authPassword2").value="";
    showAuthMode("login");
}

const supervisorMonthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
let supervisorSelectedMonth = null;
let supervisorPickerYear = new Date().getFullYear();

function getSupervisorIssueMonth(value){
    const v=String(value||"").trim().toUpperCase();
    if(!v) return null;
    // Standard EMD date: 10SEP26
    let m=v.match(/^(\d{1,2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})$/);
    if(m){
        const months={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
        let yy=parseInt(m[3],10);
        const year=yy>=70 ? 1900+yy : 2000+yy;
        return {year,month:months[m[2]]};
    }
    // Excel/ISO dates such as 2026-09-10 or 2026/09/10
    const iso=v.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})/);
    if(iso) return {year:parseInt(iso[1],10),month:parseInt(iso[2],10)-1};
    const d=new Date(value);
    if(!isNaN(d.getTime())) return {year:d.getFullYear(),month:d.getMonth()};
    return null;
}

function renderSupervisorMonthPicker(){
    const yearEl=document.getElementById("supPickerYear");
    const grid=document.getElementById("supMonthGrid");
    if(!yearEl || !grid) return;
    yearEl.textContent=supervisorPickerYear;
    grid.innerHTML=supervisorMonthNames.map((name,i)=>{
        const selected=supervisorSelectedMonth && supervisorSelectedMonth.year===supervisorPickerYear && supervisorSelectedMonth.month===i;
        return `<button type="button" class="${selected?'selected':''}" onclick="selectSupervisorMonth(${i})">${name}</button>`;
    }).join("");
}

function toggleSupervisorMonthPicker(){
    const picker=document.getElementById("supMonthPicker");
    if(!picker) return;
    const open=picker.classList.toggle("open");
    picker.setAttribute("aria-hidden",open?"false":"true");
    if(open){
        if(supervisorSelectedMonth) supervisorPickerYear=supervisorSelectedMonth.year;
        else {
            const latest=supervisorReports[0]?.issue_date;
            const parsed=getSupervisorIssueMonth(latest);
            supervisorPickerYear=parsed?.year || new Date().getFullYear();
        }
        renderSupervisorMonthPicker();
    }
}

function changeSupervisorPickerYear(delta){
    supervisorPickerYear+=delta;
    renderSupervisorMonthPicker();
}

function selectSupervisorMonth(monthIndex){
    supervisorSelectedMonth={year:supervisorPickerYear,month:monthIndex};
    const label=document.getElementById("supMonthLabel");
    if(label) label.textContent=`${supervisorMonthNames[monthIndex]} ${supervisorPickerYear}`;
    const picker=document.getElementById("supMonthPicker");
    if(picker){picker.classList.remove("open");picker.setAttribute("aria-hidden","true");}
    renderSupervisorMonthPicker();
    renderSupervisorReports();
}

function clearSupervisorMonth(){
    supervisorSelectedMonth=null;
    const label=document.getElementById("supMonthLabel");
    if(label) label.textContent="Select Month";
    const picker=document.getElementById("supMonthPicker");
    if(picker){picker.classList.remove("open");picker.setAttribute("aria-hidden","true");}
    renderSupervisorMonthPicker();
    renderSupervisorReports();
}

document.addEventListener("click",function(e){
    const wrap=document.querySelector(".month-filter-wrap");
    const picker=document.getElementById("supMonthPicker");
    if(wrap && picker && !wrap.contains(e.target) && picker.classList.contains("open")){
        picker.classList.remove("open");
        picker.setAttribute("aria-hidden","true");
    }
});

function loadSupervisorReports() {
    if(!currentProfile || currentProfile.role!=="supervisor") return;
    const all=getAllLocalReports();
    supervisorReports=[];
    Object.keys(all).forEach(userCode=>{
        if(String(userCode).startsWith("guest_")) return;
        (Array.isArray(all[userCode])?all[userCode]:[]).forEach(r=>{
            supervisorReports.push({report_data:r,profiles:{user_code:userCode},emd_number:r["EMD Number"],issue_date:r["Issue Date"],sign_in:r["Sign In"]});
        });
    });
    supervisorReports.sort((a,b)=>String(b.issue_date||"").localeCompare(String(a.issue_date||"")));
    renderSupervisorReports();
}

function renderSupervisorReports() {
    const body=document.getElementById("supervisorBody");
    const summary=document.getElementById("supervisorSummary");
    if(!body || !summary) return;

    const search=(document.getElementById("supSearch")?.value || "").trim().toLowerCase();
    const date=(document.getElementById("supDate")?.value || "").trim().toLowerCase();

    const filtered=supervisorReports.filter(item=>{
        const r=item.report_data || {};
        const hay=[
            item.profiles?.user_code, r["EMD Number"], r["Sign In"],
            r["Connected Ticket"], r["Issue Date"], r["FOP"]
        ].map(v=>String(v ?? "").toLowerCase());
        const matchesSearch=!search || hay.some(v=>v.includes(search));
        const matchesDate=!date || String(r["Issue Date"] ?? "").toLowerCase().includes(date);
        const issueMonth=getSupervisorIssueMonth(r["Issue Date"]);
        const matchesMonth=!supervisorSelectedMonth || (issueMonth && issueMonth.year===supervisorSelectedMonth.year && issueMonth.month===supervisorSelectedMonth.month);
        return matchesSearch && matchesDate && matchesMonth;
    });

    const totalETB=filtered.reduce((sum,item)=>sum+(parseFloat(item.report_data?.["Cash Collected ETB"])||0),0);
    const totalUSD=filtered.reduce((sum,item)=>sum+(parseFloat(item.report_data?.["Cash Collected USD"])||0),0);
    const users=new Set(filtered.map(item=>item.profiles?.user_code).filter(Boolean));

    summary.innerHTML=`
      <div class="metric"><div class="label">Users</div><div class="value">${users.size}</div></div>
      <div class="metric"><div class="label">Report Records</div><div class="value">${filtered.length}</div></div>
      <div class="metric primary"><div class="label">Collected ETB</div><div class="value">ETB ${formatNumber(totalETB)}</div></div>
      <div class="metric success"><div class="label">Collected USD</div><div class="value">USD ${formatNumber(totalUSD)}</div></div>`;

    if(!filtered.length){
        body.innerHTML='<tr><td colspan="11" style="text-align:center;padding:28px;color:#8094a8">No user reports found.</td></tr>';
        return;
    }

    body.innerHTML=filtered.map(item=>{
        const r=item.report_data || {};
        return `<tr>
          <td>${escapeHtml(r["Issue Date"]||"")}</td>
          <td><strong>${escapeHtml(item.profiles?.user_code||"")}</strong></td>
          <td>${escapeHtml(r["Sign In"]||"")}</td>
          <td>${escapeHtml(r["Connected Ticket"]||"")}</td>
          <td>${escapeHtml(r["EMD Number"]||"")}</td>
          <td>${escapeHtml(r["FOP"]||"")}</td>
          <td>${formatNumber(r["Baggage Qty"])}</td>
          <td>${formatNumber(r["Rate per KG"])}</td>
          <td>${formatNumber(r["Cash Collected ETB"])}</td>
          <td>${formatNumber(r["USD Rate"])}</td>
          <td>${formatNumber(r["Cash Collected USD"])}</td>
        </tr>`;
    }).join("");
}

function downloadSupervisorExcel(){
    if(typeof XLSX === "undefined") {
        const search=(document.getElementById("supSearch")?.value || "").trim().toLowerCase();
        const date=(document.getElementById("supDate")?.value || "").trim().toLowerCase();
        const filtered=supervisorReports.filter(item=>{
            const r=item.report_data || {};
            const hay=[item.profiles?.user_code,r["EMD Number"],r["Sign In"],r["Connected Ticket"],r["Issue Date"],r["FOP"]].map(v=>String(v??"").toLowerCase());
            const issueMonth=getSupervisorIssueMonth(r["Issue Date"]);
            const matchesMonth=!supervisorSelectedMonth || (issueMonth && issueMonth.year===supervisorSelectedMonth.year && issueMonth.month===supervisorSelectedMonth.month);
            return (!search || hay.some(v=>v.includes(search))) && (!date || String(r["Issue Date"]??"").toLowerCase().includes(date)) && matchesMonth;
        });
        const headers=["User ID","Issue Date","Sign In","Connected Ticket","EMD Number","Form of Payment","Weight in KG","Rate per KG (ETB)","Amount (ETB)","USD Rate","Amount in USD"];
        const rows=filtered.map(item=>{
            const r=item.report_data || {};
            return [
                item.profiles?.user_code||"", r["Issue Date"]||"", r["Sign In"]||"",
                r["Connected Ticket"]||"", r["EMD Number"]||"", r["FOP"]||"", r["Baggage Qty"]||"",
                r["Rate per KG"]||"", r["Cash Collected ETB"]||"", r["USD Rate"]||"", r["Cash Collected USD"]||""
            ];
        });
        downloadExcelFallback(headers, rows, "Excess_Baggage_Collection_Supervisor_Report.xls");
        return;
    }
    const search=(document.getElementById("supSearch")?.value || "").trim().toLowerCase();
    const date=(document.getElementById("supDate")?.value || "").trim().toLowerCase();
    const filtered=supervisorReports.filter(item=>{
        const r=item.report_data || {};
        const hay=[item.profiles?.user_code,r["EMD Number"],r["Sign In"],r["Connected Ticket"],r["Issue Date"],r["FOP"]].map(v=>String(v??"").toLowerCase());
        const issueMonth=getSupervisorIssueMonth(r["Issue Date"]);
        const matchesMonth=!supervisorSelectedMonth || (issueMonth && issueMonth.year===supervisorSelectedMonth.year && issueMonth.month===supervisorSelectedMonth.month);
        return (!search || hay.some(v=>v.includes(search))) && (!date || String(r["Issue Date"]??"").toLowerCase().includes(date)) && matchesMonth;
    });
    const rows=filtered.map(item=>{
        const r=item.report_data || {};
        return {
          "User ID":item.profiles?.user_code||"",
          "Issue Date":r["Issue Date"]||"",
          "Sign In":r["Sign In"]||"",
          "Connected Ticket":r["Connected Ticket"]||"",
          "EMD Number":r["EMD Number"]||"",
          "Form of Payment":r["FOP"]||"",
          "Weight in KG":r["Baggage Qty"]||"",
          "Rate per KG (ETB)":r["Rate per KG"]||"",
          "Amount (ETB)":r["Cash Collected ETB"]||"",
          "USD Rate":r["USD Rate"]||"",
          "Amount in USD":r["Cash Collected USD"]||""
        };
    });
    try {
        const ws=XLSX.utils.json_to_sheet(rows);
        const wb=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,ws,"All User Reports");
        XLSX.writeFile(wb,"Excess_Baggage_Collection_Supervisor_Report.xlsx");
    } catch (error) {
        console.error(error);
        const headers=["User ID","Issue Date","Sign In","Connected Ticket","EMD Number","Form of Payment","Weight in KG","Rate per KG (ETB)","Amount (ETB)","USD Rate","Amount in USD"];
        const fallbackRows=filtered.map(item=>{ const r=item.report_data||{}; return [item.profiles?.user_code||"",r["Issue Date"]||"",r["Sign In"]||"",r["Connected Ticket"]||"",r["EMD Number"]||"",r["USD Rate"]||"",r["FOP"]||"",r["Baggage Qty"]||"",r["Rate per KG"]||"",r["Cash Collected ETB"]||"",r["USD Rate"]||"",r["Cash Collected USD"]||""]; });
        downloadExcelFallback(headers,fallbackRows,"Excess_Baggage_Collection_Supervisor_Report.xls");
    }
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

            "Connected Ticket": connectedTicket,

            // Date this report was generated/saved in the browser.
            "Generated Date": new Date().toISOString().slice(0,10)

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
DAILY REPORT HISTORY
=========================================================
*/

function getReportGenerationDay(item) {
    if (item && item["Generated Date"]) return String(item["Generated Date"]);
    return "Earlier reports";
}

function formatHistoryDate(key) {
    if (key === "Earlier reports") return key;
    const d = new Date(key + "T00:00:00");
    if (Number.isNaN(d.getTime())) return key;
    return d.toLocaleDateString(undefined, {year:"numeric", month:"long", day:"numeric"});
}


function applyDarkMode(enabled) {
    document.body.classList.toggle("dark-mode", !!enabled);
    const icon = document.getElementById("darkModeIcon");
    const text = document.getElementById("darkModeText");
    if (icon) icon.textContent = enabled ? "☀" : "☾";
    if (text) text.textContent = enabled ? "Light Mode" : "Dark Mode";
    localStorage.setItem("excessBaggageDarkMode", enabled ? "1" : "0");
}

function toggleDarkMode() {
    applyDarkMode(!document.body.classList.contains("dark-mode"));
}

function initDarkMode() {
    applyDarkMode(localStorage.getItem("excessBaggageDarkMode") === "1");
}

function openHelp() {
    const panel = document.getElementById("help");
    if (!panel) return;
    panel.classList.add("open");
    panel.scrollIntoView({behavior:"smooth", block:"start"});
}

function openReportsHistory() {
    const panel = document.getElementById("reportsHistory");
    if (!panel) return;
    panel.classList.add("open");
    renderReportsHistory();
    panel.scrollIntoView({behavior:"smooth", block:"start"});
}

function closeReportsHistory() {
    const panel = document.getElementById("reportsHistory");
    if (panel) panel.classList.remove("open");
    closeDailyReport();
}

function closeDailyReport() {
    const detail = document.getElementById("historyDetail");
    if (detail) detail.classList.remove("open");
}

function renderReportsHistory() {
    const container = document.getElementById("historyDays");
    if (!container) return;
    const groups = {};
    reportData.forEach(item => {
        const day = getReportGenerationDay(item);
        if (!groups[day]) groups[day] = [];
        groups[day].push(item);
    });

    const keys = Object.keys(groups).sort((a,b) => {
        if (a === "Earlier reports") return 1;
        if (b === "Earlier reports") return -1;
        return b.localeCompare(a);
    });

    if (!keys.length) {
        container.innerHTML = '<div class="history-empty">No saved reports yet. Generate a report and it will appear here automatically.</div>';
        closeDailyReport();
        return;
    }

    container.innerHTML = keys.map(day => {
        const rows = groups[day];
        const totalETB = rows.reduce((sum,r) => sum + (parseFloat(r["Cash Collected ETB"]) || 0), 0);
        return `
          <div class="history-day">
            <strong>${escapeHtml(formatHistoryDate(day))}</strong>
            <div class="history-meta">${rows.length} report record(s) &nbsp;•&nbsp; ETB ${formatNumber(totalETB)}</div>
            <button onclick="retrieveDailyReport(${JSON.stringify(day)})">View &amp; Retrieve</button>
          </div>`;
    }).join("");

    window._dailyReportGroups = groups;
}

function retrieveDailyReport(day) {
    const groups = window._dailyReportGroups || {};
    const rows = groups[day] || [];
    const body = document.getElementById("historyDetailBody");
    const detail = document.getElementById("historyDetail");
    const title = document.getElementById("historyDetailTitle");
    if (!body || !detail || !title) return;

    title.textContent = `${formatHistoryDate(day)} — ${rows.length} record(s)`;
    body.innerHTML = rows.map(item => `
      <tr>
        <td>${escapeHtml(item["Issue Date"] || "")}</td>
        <td>${escapeHtml(item["Sign In"] || "")}</td>
        <td>${escapeHtml(item["Connected Ticket"] || "")}</td>
        <td>${escapeHtml(item["EMD Number"] || "")}</td>
        <td>${formatNumber(item["USD Rate"])}</td>
        <td>${escapeHtml(item["FOP"] || "")}</td>
        <td>${formatNumber(item["Baggage Qty"])}</td>
        <td>${formatNumber(item["Rate per KG"])}</td>
        <td>${formatNumber(item["Cash Collected ETB"])}</td>
        <td>USD ${formatNumber(item["Cash Collected USD"])}</td>
      </tr>`).join("");
    detail.classList.add("open");
    detail.scrollIntoView({behavior:"smooth", block:"start"});
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
    if (document.getElementById("reportsHistory")?.classList.contains("open")) {
        renderReportsHistory();
    }
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


function downloadExcelFallback(headers, rows, filename) {
    const esc = (v) => String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const htmlRows = [
        "<table border='1'><tr>" + headers.map(h => "<th>" + esc(h) + "</th>").join("") + "</tr>",
        ...rows.map(row => "<tr>" + row.map(v => "<td>" + esc(v) + "</td>").join("") + "</tr>"),
        "</table>"
    ].join("");
    const content = "<html><head><meta charset='UTF-8'></head><body>" + htmlRows + "</body></html>";
    const url = "data:application/vnd.ms-excel;charset=utf-8," + encodeURIComponent("\ufeff" + content);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.setAttribute("download", filename);
    a.style.display = "none";
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
}

function downloadExcel() {

    if (reportData.length === 0) {

        alert("No EMD records available.");

        return;
    }

    // If SheetJS could not load (for example because the CDN is blocked),
    // still provide a real Excel-readable .xls download instead of failing.
    if (typeof XLSX === "undefined") {
        const headers = [
            "Issue Date","Sign In","Connected Ticket","EMD Number","USD Rate",
            "Form of Payment","Weight in KG","Rate per KG (ETB)","Amount (ETB)",
            "Exchange Rate (USD Rate)","Amount in USD"
        ];
        const rows = reportData.map(item => [
            item["Issue Date"], item["Sign In"], item["Connected Ticket"],
            item["EMD Number"], item["USD Rate"], item["FOP"],
            item["Baggage Qty"], item["Rate per KG"], item["Cash Collected ETB"],
            item["USD Rate"], item["Cash Collected USD"]
        ]);
        downloadExcelFallback(headers, rows, "Excess_Baggage_Collection_Report.xls");
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
        "Excess baggage collection report"
    );

    /*
    COLUMN WIDTHS
    */

    worksheet["!cols"] = [
        { wch: 14 }, // Issue Date
        { wch: 18 }, // Sign In
        { wch: 22 }, // Connected Ticket
        { wch: 18 }, // EMD Number
        { wch: 12 }, // USD Rate
        { wch: 20 }, // Form of Payment
        { wch: 14 }, // Weight in KG
        { wch: 20 }, // Rate per KG (ETB)
        { wch: 16 }, // Amount (ETB)
        { wch: 24 }, // Exchange Rate (USD Rate)
        { wch: 16 }  // Amount in USD
    ];

    /*
    NUMBER FORMATTING
    */

    reportData.forEach((item, rowIndex) => {

        const excelRow = rowIndex + 2;

        const numberColumns = [
            "E", // USD Rate
            "G", // Weight in KG
            "H", // Rate per KG (ETB)
            "I", // Amount (ETB)
            "J", // Exchange Rate (USD Rate)
            "K"  // Amount in USD
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
        "", "", "", "", "", "TOTAL", "", "",
        totalETB, "", totalCashUSD
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

    worksheet["I" + totalExcelRow].z =
        '#,##0.00';

    worksheet["K" + totalExcelRow].z =
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

    try {
        XLSX.writeFile(workbook, "Excess_Baggage_USD_Report.xlsx");
    } catch (error) {
        console.error(error);
        const headers=["Description","Value"];
        const fallbackRows=summaryData.map(x=>[x.Description,x.Value]);
        downloadExcelFallback(headers,fallbackRows,"Excess_Baggage_USD_Report.xls");
    }

}

/*
=========================================================
IMPORT EXCEL / SPREADSHEET REPORT
=========================================================

Supported columns (the user's 3rd format):
Issue Date | Sign In | Connected Ticket | EMD Number | USD Rate |
Form of Payment | Weight in KG | Rate per KG (ETB) | Amount (ETB) |
Exchange Rate (USD Rate) | Amount in USD

Extra columns are ignored.
*/

function excelHeaderKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function excelNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const cleaned = String(value).replace(/,/g, "").replace(/\s+/g, "").trim();
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

async function importExcelReport(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const status = document.getElementById("status");
    const duplicateMessage = document.getElementById("duplicateMessage");
    const warningMessage = document.getElementById("warningMessage");

    try {
        status.textContent = "Reading Excel file...";
        duplicateMessage.style.display = "none";
        warningMessage.style.display = "none";

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
            throw new Error("The Excel file does not contain a worksheet.");
        }

        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
            raw: false,
            blankrows: false
        });

        if (!rows.length) {
            throw new Error("The Excel file is empty.");
        }

        // Find the header row even if the spreadsheet has a title above it.
        const headerIndex = rows.findIndex(row => {
            const headers = row.map(excelHeaderKey);
            return headers.includes("issue date") && headers.includes("emd number");
        });

        if (headerIndex < 0) {
            throw new Error(
                "Excel columns were not recognized. Please use the format with: Issue Date, Sign In, Connected Ticket, EMD Number, USD Rate, Form of Payment, Weight in KG, Rate per KG (ETB), Amount (ETB), Exchange Rate (USD Rate), Amount in USD."
            );
        }

        const headers = rows[headerIndex].map(excelHeaderKey);
        const col = (names) => {
            for (const name of names) {
                const i = headers.indexOf(excelHeaderKey(name));
                if (i >= 0) return i;
            }
            return -1;
        };

        const columns = {
            issueDate: col(["Issue Date"]),
            signIn: col(["Sign In"]),
            connected: col(["Connected Ticket"]),
            emd: col(["EMD Number"]),
            usdRate: col(["USD Rate"]),
            fop: col(["Form of Payment", "FOP"]),
            weight: col(["Weight in KG", "Weight KG"]),
            rateKg: col(["Rate per KG (ETB)", "Rate per KG"]),
            amountEtb: col(["Amount (ETB)", "Amount ETB"]),
            exchangeRate: col(["Exchange Rate (USD Rate)", "Exchange Rate"]),
            amountUsd: col(["Amount in USD", "Amount USD"])
        };

        const getCell = (row, index) => index >= 0 ? String(row[index] ?? "").trim() : "";
        const existing = new Set(reportData.map(r => String(r["EMD Number"] || "").trim()).filter(Boolean));
        const imported = [];
        const duplicates = [];
        const invalid = [];
        const today = new Date().toISOString().slice(0, 10);

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(cell => String(cell ?? "").trim() === "")) continue;

            const emdNumber = getCell(row, columns.emd).replace(/\s+/g, "");
            if (!emdNumber) continue;

            if (existing.has(emdNumber)) {
                duplicates.push(emdNumber);
                continue;
            }

            const issueDate = getCell(row, columns.issueDate).toUpperCase();
            const signIn = getCell(row, columns.signIn);
            const connectedTicket = getCell(row, columns.connected).replace(/\s+/g, "");
            const usdRate = excelNumber(getCell(row, columns.usdRate));
            const exchangeRate = excelNumber(getCell(row, columns.exchangeRate)) || usdRate;
            const fop = getCell(row, columns.fop).toUpperCase();
            const weight = excelNumber(getCell(row, columns.weight));
            const ratePerKg = excelNumber(getCell(row, columns.rateKg));
            const amountEtb = excelNumber(getCell(row, columns.amountEtb));
            const suppliedAmountUsd = excelNumber(getCell(row, columns.amountUsd));
            const amountUsd = suppliedAmountUsd || (exchangeRate > 0 ? amountEtb / exchangeRate : 0);

            if (!issueDate || !signIn || !usdRate || !amountEtb) {
                invalid.push(emdNumber);
                continue;
            }

            const record = {
                "No.": reportData.length + imported.length + 1,
                "EMD Number": emdNumber,
                "Issue Date": issueDate,
                "Passenger Name": "",
                "PNR": "",
                "Original Currency": "ETB",
                "Base Value": 0,
                "Total Value": amountEtb,
                "FOP": fop,
                "Original Cash": (fop === "CA" || fop === "CASH") ? amountEtb : 0,
                "USD Rate": usdRate,
                "Rate per KG": ratePerKg,
                "Baggage Qty": weight,
                "Cash Collected ETB": amountEtb,
                "Cash Collected USD": amountUsd,
                "Sign In": signIn,
                "Connected Ticket": connectedTicket,
                "Generated Date": today
            };

            reportData.push(record);
            imported.push(record);
            existing.add(emdNumber);
            processedEMDs.add(emdNumber);
        }

        if (imported.length) {
            saveReportsToCloud(imported);
            displayReport();
            status.textContent = imported.length + " report row(s) imported from Excel successfully. Total report records: " + reportData.length;
        } else {
            status.textContent = "No new Excel report rows were added.";
        }

        if (duplicates.length) {
            duplicateMessage.style.display = "block";
            duplicateMessage.innerHTML = "<strong>⚠ Duplicate EMD(s) skipped:</strong><br><br>" + duplicates.map(escapeHtml).join("<br>");
        }

        if (invalid.length) {
            warningMessage.style.display = "block";
            warningMessage.innerHTML = "<strong>⚠ Rows skipped because required data was missing:</strong><br><br>" + invalid.map(escapeHtml).join("<br>");
        }
    } catch (error) {
        console.error(error);
        status.textContent = "Excel import failed.";
        alert(error.message || "Could not read the Excel file.");
    } finally {
        // Allow the same file to be selected again later.
        event.target.value = "";
    }
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
    await loadSession();
});

