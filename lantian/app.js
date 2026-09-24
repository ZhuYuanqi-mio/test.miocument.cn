const API = "https://zion-app.functorz.com/zero/BqvlMwgMMro/api/graphql-v2";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJoYXN1cmFfY2xhaW1zIjp7IngtaGFzdXJhLWRlZmF1bHQtcm9sZSI6ImFkbWluIiwieC1oYXN1cmEtYWxsb3dlZC1yb2xlcyI6WyJ1c2VyIiwiYWRtaW4iXSwieC1oYXN1cmEtdXNlci1pZCI6IjEwMDk5OTk5OTk5OTk5OTkifSwiZGVmYXVsdFJvbGUiOiJhZG1pbiIsInJvbGVzIjpbImFkbWluIiwidXNlciJdLCJaRVJPX1VTRVJfSUQiOiIxMDA5OTk5OTk5OTk5OTk5IiwiemVybyI6e30sImlzcyI6IjEwMDAwMDAwMDAxOTIxMzUiLCJpYXQiOjE3OTAyMzM3NjB9.n4iaEanNg7M3bU_keffZUjkTGMzxUX-FvuRWHRNon-s";

const MEMBER_FIELDS = "id name phone password bank_name bank_card role hire_type job_type default_pay_mode daily_rate hourly_rate overtime_rate status";
const PRODUCT_FIELDS = "id product_name model work_kind unit_price_regular unit_price_hourly commission_rate status";
const ENTRY_FIELDS = "id work_date biz_type pay_mode work_kind product_name model qty hours minutes session unit_price amount commission remark locked member_id product_id slip_id created_by_id";
const SLIP_FIELDS = "id year_month biz_type status total_qty total_amount total_commission daily_count hourly_hours overtime_hours piece_qty reward deduct net_pay pay_method paid_at boss_signed accountant_signed staff_signed member_id";

const state = {
  me: null,
  tab: "work",
  members: [],
  products: [],
  toastTimer: 0,
};

const $ = (sel, root = document) => root.querySelector(sel);
const app = () => $("#app");
const today = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const monthOf = (d = today()) => d.slice(0, 7);
function nextMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-01`;
}
function datePlus(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const z = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${z(dt.getMonth() + 1)}-${z(dt.getDate())}`;
}
const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const money = (v) => num(v).toFixed(2);
const isAdmin = () => state.me?.role === "管理员";
const myId = () => Number(state.me.id);
function parsePatch(entry) {
  if (!entry?.remark) return null;
  try {
    const obj = JSON.parse(entry.remark);
    return obj && obj.kind === "patch" ? obj : null;
  } catch {
    return null;
  }
}
function patchStatus(entry) {
  return parsePatch(entry)?.status || "";
}

function toast(text) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.remove(), 1800);
}

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function topbar(title, rightHtml = "") {
  return `<header class="topbar"><h1>${esc(title)}</h1>${rightHtml}</header>`;
}

function iconPeople() {
  return `<svg class="ico-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4.5 19.2c.9-2.9 3.7-5.2 7.5-5.2s6.6 2.3 7.5 5.2c.2.6-.3 1.3-.9 1.3H5.4c-.6 0-1.1-.7-.9-1.3Z"/></svg>`;
}

function tabbar() {
  const tabs = isAdmin()
    ? [
        ["review", "登记", "☰"],
        ["pay", "工资", "¥"],
        ["people", "人员", iconPeople()],
      ]
    : [
        ["work", "记工", "✎"],
        ["pay", "工资", "¥"],
        ["me", "我的", "●"],
      ];
  return `<nav class="tabbar">${tabs
    .map(([id, name, ico]) => `<button class="${state.tab === id ? "on" : ""}" data-tab="${id}"><span class="ico">${ico}</span>${name}</button>`)
    .join("")}</nav>`;
}

function field(label, inner) {
  return `<div class="field"><label>${esc(label)}</label>${inner}</div>`;
}

function selectHtml(name, options, value) {
  return `<select name="${name}">${options
    .map((o) => `<option value="${esc(o)}" ${String(o) === String(value || "") ? "selected" : ""}>${esc(o)}</option>`)
    .join("")}</select>`;
}

function unitPrice(member, product) {
  if (!product) return 0;
  return member?.hire_type === "钟点工" ? num(product.unit_price_hourly) : num(product.unit_price_regular);
}

function calcEntry(member, product, form) {
  const qty = num(form.qty);
  const hours = num(form.hours) + num(form.minutes) / 60;
  const overtimeRate = num(member.overtime_rate || 10);
  let unit = 0;
  let amount = 0;
  let commission = 0;
  if (form.biz_type === "销售") {
    unit = num(product?.commission_rate);
    commission = qty * unit;
  } else if (form.pay_mode === "计件") {
    unit = unitPrice(member, product);
    amount = qty * unit;
  } else if (form.pay_mode === "日工") {
    unit = num(member.daily_rate);
    amount = unit;
  } else if (form.pay_mode === "计时") {
    unit = num(member.hourly_rate);
    amount = unit * hours;
  } else if (form.pay_mode === "加班") {
    unit = overtimeRate;
    amount = unit * hours;
  }
  return { unit_price: unit, amount, commission };
}

function nullIfEmpty(v) {
  return v === undefined || v === null || v === "" ? null : v;
}

function netPay(slip) {
  return num(slip.total_amount) + num(slip.total_commission) + num(slip.reward) - num(slip.deduct);
}

function canRequestChange(entry, slip) {
  if (entry.locked) return false;
  if (slip?.status === "已发放") return false;
  if (isAdmin()) return false;
  if (Number(entry.member_id) !== myId()) return false;
  const p = parsePatch(entry);
  return !p || p.status !== "待审批";
}

function queryUserId() {
  const u = new URLSearchParams(location.search).get("user");
  const n = Number(u);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function setLoggedIn(user) {
  state.me = user;
  state.tab = isAdmin() ? "review" : "work";
  localStorage.setItem("salary_me_id", String(user.id));
}

async function loadBase() {
  const data = await gql(`query {
    salary_member(where: { status: { _eq: "在职" } }, order_by: { id: asc }) { ${MEMBER_FIELDS} }
    salary_product(where: { status: { _eq: "启用" } }, order_by: { id: asc }) { ${PRODUCT_FIELDS} }
  }`);
  state.members = data.salary_member;
  state.products = data.salary_product;
}

function loginView() {
  app().innerHTML = `
    <div class="login">
      <div class="brand">蓝天工资</div>
      ${field("账号", `<input name="phone" placeholder="请输入账号" />`)}
      ${field("密码", `<input name="password" type="password" placeholder="请输入密码" />`)}
      <button class="btn block" id="loginBtn">登录</button>
    </div>`;
  $("#loginBtn").onclick = async () => {
    try {
      const phone = $("input[name=phone]").value.trim();
      const password = $("input[name=password]").value;
      const data = await gql(
        `query($phone:String!){ salary_member(where:{phone:{_eq:$phone}, status:{_eq:"在职"}}){ ${MEMBER_FIELDS} } }`,
        { phone }
      );
      const user = data.salary_member[0];
      if (!user || user.password !== password) return toast("账号或密码不对");
      setLoggedIn(user);
      await loadBase();
      render();
    } catch (e) {
      toast(e.message);
    }
  };
}

function logout() {
  state.me = null;
  localStorage.removeItem("salary_me_id");
  const url = new URL(location.href);
  url.searchParams.delete("user");
  history.replaceState(null, "", url.pathname + url.hash);
  loginView();
}

function shell(title, body) {
  const right = isAdmin()
    ? `<button class="logout-link" id="logoutTop" type="button">退出登录</button>`
    : `<div class="sub">${esc(state.me.name)}</div>`;
  app().innerHTML = `${topbar(title, right)}<main class="page">${body}</main>${tabbar()}`;
  app().querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      render();
    };
  });
  const logoutBtn = $("#logoutTop");
  if (logoutBtn) logoutBtn.onclick = logout;
}

async function workView() {
  if (isAdmin()) return reviewView();
  const member = state.me;
  const date = today();
  const data = await gql(
    `query($id:bigint!, $from:date!, $to:date!){
      salary_entry(where:{member_id:{_eq:$id}, work_date:{_gte:$from, _lt:$to}}, order_by:{id:desc}){ ${ENTRY_FIELDS} }
    }`,
    { id: myId(), from: date, to: datePlus(date, 1) }
  );
  const entries = data.salary_entry;
  const products = state.products;
  shell(
    "记工",
    `
    <div class="tabs" id="bizTabs">
      ${["计件", "考勤", "销售"].map((x) => `<button class="chip" data-biz="${x}">${x}</button>`).join("")}
    </div>
    <form class="card" id="workForm">
      <input type="hidden" name="biz_type" value="计件" />
      ${field("日期", `<input type="date" name="work_date" value="${date}" />`)}
      <div id="dyn"></div>
      <div class="muted" id="preview">金额 0.00</div>
      <div style="height:10px"></div>
      <button class="btn block" type="submit">保存</button>
    </form>
    <div class="card">
      <h2>今天</h2>
      ${
        entries.length
          ? entries
              .map(
                (e) => `<div class="list-item">
                  <div class="row"><div class="title">${esc(e.pay_mode)} ${e.product_name ? "· " + esc(e.product_name) : ""}</div><div class="amount">¥${money(num(e.amount) + num(e.commission))}</div></div>
                  <div class="muted">${esc(e.model || e.work_kind || "")} ${e.qty ? "×" + e.qty : ""} ${e.hours ? e.hours + "小时" : ""}</div>
                  ${e.locked ? `<span class="tag">已锁定</span>` : patchStatus(e) === "待审批" ? `<span class="tag red">改单待审</span>` : `<button class="btn ghost" data-del="${e.id}">删除</button>`}
                </div>`
              )
              .join("")
          : `<div class="empty">今天还没有记工</div>`
      }
    </div>`
  );

  const form = $("#workForm");
  const dyn = $("#dyn");
  const setBiz = (biz) => {
    form.biz_type.value = biz;
    [...document.querySelectorAll("[data-biz]")].forEach((b) => b.classList.toggle("on", b.dataset.biz === biz));
    const productOpts = products
      .filter((p) => (biz === "销售" ? p.work_kind === "销售" : p.work_kind !== "销售"))
      .map((p) => `<option value="${p.id}">${esc(p.product_name)} / ${esc(p.model)}</option>`)
      .join("");
    if (biz === "计件") {
      dyn.innerHTML = `
        ${field("工种", selectHtml("work_kind", ["冲压", "焊接", "组装", "铆接"], member.job_type))}
        ${field("产品型号", `<select name="product_id">${productOpts}</select>`)}
        ${field("数量", `<input name="qty" type="number" step="1" value="1" />`)}
        <input type="hidden" name="pay_mode" value="计件" />`;
    } else if (biz === "销售") {
      dyn.innerHTML = `
        ${field("产品型号", `<select name="product_id">${productOpts}</select>`)}
        ${field("数量", `<input name="qty" type="number" step="1" value="1" />`)}
        <input type="hidden" name="pay_mode" value="计件" />
        <input type="hidden" name="work_kind" value="销售" />`;
    } else {
      dyn.innerHTML = `
        ${field("方式", selectHtml("pay_mode", ["日工", "计时", "加班", "计件"], member.default_pay_mode === "计件" ? "计件" : member.default_pay_mode))}
        <div id="attendExtra"></div>`;
      const extra = () => {
        const mode = form.pay_mode.value;
        const box = $("#attendExtra");
        if (mode === "计件") {
          box.innerHTML = `
            ${field("工种", selectHtml("work_kind", ["冲压", "焊接", "组装", "铆接"], member.job_type))}
            ${field("产品型号", `<select name="product_id">${products.filter((p) => p.work_kind !== "销售").map((p) => `<option value="${p.id}">${esc(p.product_name)} / ${esc(p.model)}</option>`).join("")}</select>`)}
            ${field("数量", `<input name="qty" type="number" value="1" />`)}`;
        } else if (mode === "日工") {
          box.innerHTML = field("时段", selectHtml("session", ["", "上午", "下午"], ""));
        } else {
          box.innerHTML = `${field("小时", `<input name="hours" type="number" step="0.5" value="1" />`)}${field("分钟", `<input name="minutes" type="number" value="0" />`)}`;
        }
        preview();
      };
      form.pay_mode.onchange = extra;
      extra();
    }
    preview();
  };

  const preview = () => {
    const fd = Object.fromEntries(new FormData(form).entries());
    const product = products.find((p) => String(p.id) === String(fd.product_id));
    const calc = calcEntry(member, product, fd);
    $("#preview").textContent = `金额 ${money(calc.amount)}  提成 ${money(calc.commission)}`;
  };
  form.addEventListener("input", preview);
  document.querySelectorAll("[data-biz]").forEach((b) => (b.onclick = () => setBiz(b.dataset.biz)));
  setBiz("计件");

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    const product = products.find((p) => String(p.id) === String(fd.product_id));
    if ((fd.biz_type === "计件" || fd.pay_mode === "计件" || fd.biz_type === "销售") && !product) return toast("先选产品型号");
    const calc = calcEntry(member, product, fd);
    try {
      await gql(
        `mutation($o:[salary_entry_insert_input!]!){ insert_salary_entry(objects:$o){ returning { id } } }`,
        {
          o: [
            {
              member_id: myId(),
              created_by_id: myId(),
              work_date: fd.work_date,
              biz_type: fd.biz_type,
              pay_mode: fd.pay_mode,
              work_kind: fd.work_kind || null,
              product_id: product ? Number(product.id) : null,
              product_name: product?.product_name || null,
              model: product?.model || null,
              qty: fd.qty === undefined || fd.qty === "" ? null : num(fd.qty),
              hours: fd.hours === undefined || fd.hours === "" ? null : num(fd.hours),
              minutes: fd.minutes === undefined || fd.minutes === "" ? null : num(fd.minutes),
              session: fd.session || null,
              unit_price: calc.unit_price,
              amount: calc.amount,
              commission: calc.commission,
              locked: false,
            },
          ],
        }
      );
      toast("已保存");
      workView();
    } catch (e) {
      toast(e.message);
    }
  };

  app().querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await gql(`mutation($id:bigint!){ delete_salary_entry(where:{id:{_eq:$id}, locked:{_eq:false}}){ affected_rows } }`, { id: Number(btn.dataset.del) });
        toast("已删除");
        workView();
      } catch (e) {
        toast(e.message);
      }
    };
  });
}

async function payView() {
  const where = isAdmin() ? "" : `where:{member_id:{_eq:${Number(state.me.id)}}}`;
  const data = await gql(`query { salary_slip(${where} order_by:{year_month:desc, id:desc}){ ${SLIP_FIELDS} member { name } } }`);
  const slips = data.salary_slip;
  shell(
    "工资",
    `
    ${isAdmin() ? `<button class="btn block" id="genBtn" style="margin-bottom:12px">生成本月工资单</button>` : ""}
    ${
      slips.length
        ? slips
            .map((s) => {
              const tag = s.status === "已发放" ? "green" : s.status === "已审批" ? "blue" : "red";
              return `<div class="card" data-slip="${s.id}">
                <div class="row"><div class="title">${esc(s.member?.name || "")} · ${esc(s.year_month)}</div><span class="tag ${tag}">${esc(s.status)}</span></div>
                <div class="muted">${esc(s.biz_type)}</div>
                <div class="row" style="margin-top:8px"><span>实发</span><span class="amount">¥${money(s.net_pay)}</span></div>
              </div>`;
            })
            .join("")
        : `<div class="empty">还没有工资单</div>`
    }`
  );
  if (isAdmin()) $("#genBtn").onclick = generateSlips;
  app().querySelectorAll("[data-slip]").forEach((el) => {
    el.onclick = () => slipView(Number(el.dataset.slip));
  });
}

function memberName(id) {
  return state.members.find((m) => Number(m.id) === Number(id))?.name || `#${id}`;
}

async function reviewView() {
  const date = today();
  const data = await gql(
    `query($from:date!, $to:date!){
      today: salary_entry(where:{work_date:{_gte:$from, _lt:$to}}, order_by:{id:desc}){ ${ENTRY_FIELDS} }
      pending: salary_entry(where:{locked:{_eq:false}}, order_by:{id:desc}, limit:80){ ${ENTRY_FIELDS} }
    }`,
    { from: date, to: datePlus(date, 1) }
  );
  const pending = data.pending.filter((e) => patchStatus(e) === "待审批");
  shell(
    "登记",
    `
    <div class="card">
      <h2>待审批修改 ${pending.length ? pending.length : ""}</h2>
      ${
        pending.length
          ? pending
              .map(
                (e) => `<div class="list-item">
                  <div class="row"><div class="title">${esc(memberName(e.member_id))} · ${esc(e.pay_mode)}</div><div class="amount">¥${money(num(e.amount) + num(e.commission))}</div></div>
                  <div class="muted">${esc(e.work_date)} ${esc(e.product_name || "")} ${esc(e.model || "")} ${e.qty ? "×" + e.qty : ""}</div>
                  ${parsePatch(e)?.want ? `<div class="muted">申请改为：${esc(parsePatch(e).want.product_name || e.product_name || "")} ${esc(parsePatch(e).want.model || "")} ${parsePatch(e).want.qty != null ? "×" + parsePatch(e).want.qty : ""} ${parsePatch(e).want.hours != null ? parsePatch(e).want.hours + "小时" : ""}</div>` : ""}
                  <div class="row" style="margin-top:8px">
                    <button class="btn ghost" data-ok="${e.id}">通过</button>
                    <button class="btn weak" data-no="${e.id}">驳回</button>
                  </div>
                </div>`
              )
              .join("")
          : `<div class="empty">没有待审修改</div>`
      }
    </div>
    <div class="card">
      <h2>今天登记</h2>
      ${data.today.length ? data.today.map((e) => `<div class="list-item"><div class="muted">${esc(memberName(e.member_id))}</div><div class="row"><div class="title">${esc(e.pay_mode)} ${e.product_name ? "· " + esc(e.product_name) : ""}</div><div class="amount">¥${money(num(e.amount) + num(e.commission))}</div></div><div class="muted">${esc(e.model || e.work_kind || "")} ${e.qty ? "×" + e.qty : ""} ${e.hours ? e.hours + "小时" : ""}</div>${patchStatus(e) === "待审批" ? `<span class="tag red">改单待审</span>` : ""}</div>`).join("") : `<div class="empty">今天还没有人记工</div>`}
    </div>`
  );
  app().querySelectorAll("[data-ok]").forEach((btn) => {
    btn.onclick = () => decidePatch(Number(btn.dataset.ok), true).then(reviewView);
  });
  app().querySelectorAll("[data-no]").forEach((btn) => {
    btn.onclick = () => decidePatch(Number(btn.dataset.no), false).then(reviewView);
  });
}

async function decidePatch(entryId, pass) {
  const data = await gql(`query($id:bigint!){ salary_entry_by_pk(id:$id){ ${ENTRY_FIELDS} } }`, { id: entryId });
  const entry = data.salary_entry_by_pk;
  const patch = parsePatch(entry);
  if (!patch || patch.status !== "待审批") return toast("没有待审申请");
  if (!pass) {
    await gql(`mutation($id:bigint!,$s:salary_entry_set_input!){ update_salary_entry(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, {
      id: entryId,
      s: { remark: JSON.stringify({ ...patch, status: "已驳回" }) },
    });
    toast("已驳回");
    return;
  }
  const member = state.members.find((m) => Number(m.id) === Number(entry.member_id));
  const want = { ...entry, ...(patch.want || {}) };
  const product = state.products.find((p) => Number(p.id) === Number(want.product_id || entry.product_id));
  if (want.product_id && product) {
    want.product_name = product.product_name;
    want.model = product.model;
  }
  const calc = calcEntry(member, product, want);
  const set = {
    work_date: want.work_date || entry.work_date,
    product_id: want.product_id ? Number(want.product_id) : entry.product_id,
    product_name: want.product_name ?? entry.product_name,
    model: want.model ?? entry.model,
    qty: want.qty == null || want.qty === "" ? entry.qty : num(want.qty),
    hours: want.hours == null || want.hours === "" ? entry.hours : num(want.hours),
    minutes: want.minutes == null || want.minutes === "" ? entry.minutes : num(want.minutes),
    session: want.session ?? entry.session,
    unit_price: calc.unit_price,
    amount: calc.amount,
    commission: calc.commission,
    remark: JSON.stringify({ ...patch, status: "已通过" }),
  };
  await gql(`mutation($id:bigint!,$s:salary_entry_set_input!){ update_salary_entry(where:{id:{_eq:$id}, locked:{_eq:false}}, _set:$s){ affected_rows } }`, {
    id: entryId,
    s: set,
  });
  if (entry.slip_id) await recomputeSlip(entry.slip_id);
  toast("已通过并改账");
}

function groupKey(entry) {
  return `${entry.member_id}|${String(entry.work_date).slice(0, 7)}|${entry.biz_type}`;
}

async function generateSlips() {
  try {
    const month = monthOf();
    const data = await gql(`query($from:date!, $to:date!){
      salary_entry(where:{locked:{_eq:false}, slip_id:{_is_null:true}, work_date:{_gte:$from, _lt:$to}}){ ${ENTRY_FIELDS} }
    }`, { from: `${month}-01`, to: nextMonth(month) });
    const groups = {};
    data.salary_entry.forEach((e) => {
      const k = groupKey(e);
      (groups[k] ||= []).push(e);
    });
    let count = 0;
    for (const [k, list] of Object.entries(groups)) {
      const [memberId, yearMonth, bizType] = k.split("|");
      const existed = await gql(`query($mid:bigint!,$ym:String!,$bt:String!){
        salary_slip(where:{member_id:{_eq:$mid}, year_month:{_eq:$ym}, biz_type:{_eq:$bt}}){ ${SLIP_FIELDS} }
      }`, { mid: Number(memberId), ym: yearMonth, bt: bizType });
      let slip = existed.salary_slip[0];
      const sums = summarize(list, slip);
      if (!slip) {
        const created = await gql(`mutation($o:[salary_slip_insert_input!]!){ insert_salary_slip(objects:$o){ returning { ${SLIP_FIELDS} } } }`, {
          o: [{ member_id: Number(memberId), year_month: yearMonth, biz_type: bizType, status: "待审批", ...sums, boss_signed: false, accountant_signed: false, staff_signed: false }],
        });
        slip = created.insert_salary_slip.returning[0];
      } else if (slip.status === "已发放") {
        continue;
      } else {
        await gql(`mutation($id:bigint!,$s:salary_slip_set_input!){ update_salary_slip(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, {
          id: slip.id,
          s: { ...sums, status: slip.status === "待汇总" ? "待审批" : slip.status },
        });
      }
      const ids = list.map((e) => e.id);
      await gql(`mutation($ids:[bigint!]!,$sid:bigint!){ update_salary_entry(where:{id:{_in:$ids}}, _set:{slip_id:$sid}){ affected_rows } }`, { ids, sid: slip.id });
      count += 1;
    }
    toast(count ? `已生成 ${count} 张` : "没有未入单的记工");
    payView();
  } catch (e) {
    toast(e.message);
  }
}

function summarize(entries, slip) {
  const total_qty = entries.reduce((a, e) => a + num(e.qty), 0);
  const total_amount = entries.reduce((a, e) => a + num(e.amount), 0);
  const total_commission = entries.reduce((a, e) => a + num(e.commission), 0);
  const daily_count = entries.filter((e) => e.pay_mode === "日工").length;
  const hourly_hours = entries.filter((e) => e.pay_mode === "计时").reduce((a, e) => a + num(e.hours) + num(e.minutes) / 60, 0);
  const overtime_hours = entries.filter((e) => e.pay_mode === "加班").reduce((a, e) => a + num(e.hours) + num(e.minutes) / 60, 0);
  const piece_qty = entries.filter((e) => e.pay_mode === "计件").reduce((a, e) => a + num(e.qty), 0);
  const reward = num(slip?.reward);
  const deduct = num(slip?.deduct);
  return {
    total_qty,
    total_amount,
    total_commission,
    daily_count,
    hourly_hours,
    overtime_hours,
    piece_qty,
    net_pay: total_amount + total_commission + reward - deduct,
  };
}

async function recomputeSlip(slipId) {
  const data = await gql(`query($id:bigint!){
    salary_slip_by_pk(id:$id){ ${SLIP_FIELDS} }
    salary_entry(where:{slip_id:{_eq:$id}}){ ${ENTRY_FIELDS} }
  }`, { id: slipId });
  const slip = data.salary_slip_by_pk;
  if (!slip || slip.status === "已发放") return slip;
  const sums = summarize(data.salary_entry, slip);
  await gql(`mutation($id:bigint!,$s:salary_slip_set_input!){ update_salary_slip(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, { id: slipId, s: sums });
  return { ...slip, ...sums };
}

async function slipView(id) {
  let data = await gql(`query($id:bigint!){
    salary_slip_by_pk(id:$id){ ${SLIP_FIELDS} member { ${MEMBER_FIELDS} } }
    salary_entry(where:{slip_id:{_eq:$id}}, order_by:{work_date:asc, id:asc}){ ${ENTRY_FIELDS} }
  }`, { id });
  let slip = data.salary_slip_by_pk;
  const entries = data.salary_entry;
  const member = slip.member;
  const locked = slip.status === "已发放";
  const admin = isAdmin();
  shell(
    "工资单",
    `
    <div class="card">
      <div class="row"><div class="title">${esc(member.name)} · ${esc(slip.year_month)}</div><span class="tag ${slip.status === "已发放" ? "green" : "blue"}">${esc(slip.status)}</span></div>
      <div class="muted">${esc(slip.biz_type)} · ${esc(member.hire_type)}</div>
    </div>
    <div class="summary">
      <div class="cell"><div class="muted">合计数量</div><div class="num">${money(slip.total_qty)}</div></div>
      <div class="cell"><div class="muted">合计金额</div><div class="num">${money(slip.total_amount)}</div></div>
      <div class="cell"><div class="muted">合计提成</div><div class="num">${money(slip.total_commission)}</div></div>
      <div class="cell"><div class="muted">实发工资</div><div class="num">¥${money(slip.net_pay)}</div></div>
    </div>
    <div class="card">
      ${admin && !locked ? field("奖励", `<input id="reward" type="number" value="${num(slip.reward)}" />`) : `<div class="row"><span>奖励</span><span>${money(slip.reward)}</span></div>`}
      ${admin && !locked ? field("扣除", `<input id="deduct" type="number" value="${num(slip.deduct)}" />`) : `<div class="row"><span>扣除</span><span>${money(slip.deduct)}</span></div>`}
      ${admin && !locked ? field("发放方式", selectHtml("pay_method", ["现金", "银行转账"], slip.pay_method || "现金")) : `<div class="row"><span>发放方式</span><span>${esc(slip.pay_method || "-")}</span></div>`}
      ${admin && !locked ? `<button class="btn block" id="saveMoney">保存奖励扣除</button>` : ""}
    </div>
    <div class="card">
      <h2>明细</h2>
      ${entries
        .map((e) => {
          const p = parsePatch(e);
          const pending = p?.status === "待审批";
          const canAsk = canRequestChange(e, slip);
          return `<div class="list-item">
            <div class="row"><div>${esc(e.work_date)} · ${esc(e.pay_mode)}</div><div>¥${money(num(e.amount) + num(e.commission))}</div></div>
            <div class="muted">${esc(e.product_name || e.work_kind || "")} ${e.qty ? "×" + e.qty : ""} ${e.hours ? e.hours + "h" : ""}</div>
            ${pending ? `<div class="muted">申请改为：${esc(p.want?.product_name || e.product_name || "")} ${esc(p.want?.model || "")} ${p.want?.qty != null ? "×" + p.want.qty : ""} ${p.want?.hours != null ? p.want.hours + "小时" : ""} ${p.want?.work_date && p.want.work_date !== e.work_date ? p.want.work_date : ""}</div><span class="tag red">改单待审</span>` : ""}
            ${p?.status === "已驳回" ? `<span class="tag">上次申请已驳回</span>` : ""}
            ${
              admin && pending
                ? `<div class="row" style="margin-top:6px"><button class="btn ghost" data-ok="${e.id}">通过</button><button class="btn weak" data-no="${e.id}">驳回</button></div>`
                : ""
            }
            ${
              canAsk
                ? `<div class="row" style="margin-top:6px">
                     <input data-qty="${e.id}" type="number" value="${num(e.qty)}" style="width:90px" placeholder="数量" />
                     <input data-hours="${e.id}" type="number" step="0.5" value="${num(e.hours)}" style="width:80px" placeholder="小时" />
                     <button class="btn ghost" data-ask="${e.id}">申请修改</button>
                   </div>`
                : ""
            }
          </div>`;
        })
        .join("")}
    </div>
    <div class="card">
      <div class="row"><span>老板签字</span><span>${slip.boss_signed ? "已签" : "未签"}</span></div>
      <div class="row"><span>会计签字</span><span>${slip.accountant_signed ? "已签" : "未签"}</span></div>
      <div class="row"><span>员工签字</span><span>${slip.staff_signed ? "已签" : "未签"}</span></div>
      ${admin && !locked ? `<div style="height:10px"></div><button class="btn ghost block" id="signBtn">审批签字</button><div style="height:8px"></div><button class="btn block" id="payBtn">确认发放并锁定</button>` : ""}
      ${!admin && !locked ? `<div style="height:10px"></div><button class="btn block" id="staffSign">员工签字</button>` : ""}
      <div style="height:8px"></div>
      <button class="btn weak block" id="printBtn">打印工资单</button>
    </div>
    <button class="btn weak block" id="backPay">返回列表</button>`
  );
  $("#backPay").onclick = payView;
  $("#printBtn").onclick = () => window.print();
  if (admin && !locked) {
    $("#saveMoney").onclick = async () => {
      const reward = num($("#reward").value);
      const deduct = num($("#deduct").value);
      const pay_method = $("select[name=pay_method]").value;
      const net_pay = num(slip.total_amount) + num(slip.total_commission) + reward - deduct;
      await gql(`mutation($id:bigint!,$s:salary_slip_set_input!){ update_salary_slip(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, {
        id,
        s: { reward, deduct, pay_method, net_pay },
      });
      toast("已保存");
      slipView(id);
    };
    $("#signBtn").onclick = async () => {
      await gql(`mutation($id:bigint!){ update_salary_slip(where:{id:{_eq:$id}}, _set:{boss_signed:true, accountant_signed:true, status:"已审批"}){ affected_rows } }`, { id });
      toast("已审批");
      slipView(id);
    };
    $("#payBtn").onclick = async () => {
      const ids = entries.map((e) => e.id);
      await gql(`mutation($id:bigint!,$ids:[bigint!]!){
        update_salary_slip(where:{id:{_eq:$id}}, _set:{status:"已发放", paid_at:"${new Date().toISOString()}"}){ affected_rows }
        update_salary_entry(where:{id:{_in:$ids}}, _set:{locked:true}){ affected_rows }
      }`, { id, ids });
      toast("已发放，金额锁定");
      slipView(id);
    };
  }
  if (!admin && !locked) {
    $("#staffSign").onclick = async () => {
      await gql(`mutation($id:bigint!){ update_salary_slip(where:{id:{_eq:$id}}, _set:{staff_signed:true}){ affected_rows } }`, { id });
      toast("已签字");
      slipView(id);
    };
  }
  app().querySelectorAll("[data-ask]").forEach((btn) => {
    btn.onclick = async () => {
      const eid = Number(btn.dataset.ask);
      const entry = entries.find((e) => Number(e.id) === eid);
      const qtyEl = $(`.page [data-qty="${eid}"]`);
      const hoursEl = $(`.page [data-hours="${eid}"]`);
      const want = {
        qty: qtyEl ? num(qtyEl.value) : entry.qty,
        hours: hoursEl ? num(hoursEl.value) : entry.hours,
        product_name: entry.product_name,
        model: entry.model,
        work_date: entry.work_date,
        product_id: entry.product_id,
      };
      await gql(`mutation($id:bigint!,$s:salary_entry_set_input!){ update_salary_entry(where:{id:{_eq:$id}, locked:{_eq:false}}, _set:$s){ affected_rows } }`, {
        id: eid,
        s: { remark: JSON.stringify({ kind: "patch", status: "待审批", want }) },
      });
      toast("已提交修改申请，等管理员审批");
      slipView(id);
    };
  });
  app().querySelectorAll("[data-ok]").forEach((btn) => {
    btn.onclick = () => decidePatch(Number(btn.dataset.ok), true).then(() => slipView(id));
  });
  app().querySelectorAll("[data-no]").forEach((btn) => {
    btn.onclick = () => decidePatch(Number(btn.dataset.no), false).then(() => slipView(id));
  });
}

async function peopleView() {
  if (!isAdmin()) return workView();
  await loadBase();
  const all = await gql(`query { salary_member(order_by:{id:asc}){ ${MEMBER_FIELDS} } salary_product(order_by:{id:asc}){ ${PRODUCT_FIELDS} } }`);
  shell(
    "人员",
    `
    <div class="tabs">
      <button class="chip on" data-pane="m">员工</button>
      <button class="chip" data-pane="p">单价本</button>
    </div>
    <div id="paneM">
      <button class="btn block" id="addMember" style="margin-bottom:10px">新增员工</button>
      ${all.salary_member
        .map(
          (m) => `<div class="card" data-edit-m="${m.id}">
            <div class="row"><div class="title">${esc(m.name)}</div><span class="tag ${m.role === "管理员" ? "blue" : ""}">${esc(m.role)}</span></div>
            <div class="muted">${esc(m.phone)} · ${esc(m.hire_type)} · ${esc(m.job_type)}</div>
          </div>`
        )
        .join("")}
    </div>
    <div id="paneP" hidden>
      <button class="btn block" id="addProduct" style="margin-bottom:10px">新增型号</button>
      ${all.salary_product
        .map(
          (p) => `<div class="card" data-edit-p="${p.id}">
            <div class="title">${esc(p.product_name)} / ${esc(p.model)}</div>
            <div class="muted">${esc(p.work_kind)} · 长期 ${money(p.unit_price_regular)} · 钟点 ${money(p.unit_price_hourly)} · 提成 ${money(p.commission_rate)}</div>
          </div>`
        )
        .join("")}
    </div>`
  );
  const paneM = $("#paneM");
  const paneP = $("#paneP");
  app().querySelectorAll("[data-pane]").forEach((b) => {
    b.onclick = () => {
      app().querySelectorAll("[data-pane]").forEach((x) => x.classList.toggle("on", x === b));
      paneM.hidden = b.dataset.pane !== "m";
      paneP.hidden = b.dataset.pane !== "p";
    };
  });
  $("#addMember").onclick = () => memberForm();
  $("#addProduct").onclick = () => productForm();
  app().querySelectorAll("[data-edit-m]").forEach((el) => (el.onclick = () => memberForm(all.salary_member.find((m) => Number(m.id) === Number(el.dataset.editM)))));
  app().querySelectorAll("[data-edit-p]").forEach((el) => (el.onclick = () => productForm(all.salary_product.find((p) => Number(p.id) === Number(el.dataset.editP)))));
}

function memberForm(m) {
  shell(
    m ? "编辑员工" : "新增员工",
    `<form class="card" id="mf">
      ${field("姓名", `<input name="name" value="${esc(m?.name || "")}" required />`)}
      ${field("账号", `<input name="phone" value="${esc(m?.phone || "")}" required />`)}
      ${field("密码", `<input name="password" value="${esc(m?.password || "")}" required />`)}
      ${field("角色", selectHtml("role", ["员工", "管理员"], m?.role || "员工"))}
      ${field("用工性质", selectHtml("hire_type", ["长期工", "钟点工"], m?.hire_type || "长期工"))}
      ${field("工种", selectHtml("job_type", ["冲压", "焊接", "组装", "销售", "综合"], m?.job_type || "综合"))}
      ${field("默认计薪", selectHtml("default_pay_mode", ["日工", "计时", "计件"], m?.default_pay_mode || "日工"))}
      ${field("日工单价", `<input name="daily_rate" type="number" step="0.01" value="${num(m?.daily_rate)}" />`)}
      ${field("计时单价", `<input name="hourly_rate" type="number" step="0.01" value="${num(m?.hourly_rate)}" />`)}
      ${field("加班单价", `<input name="overtime_rate" type="number" step="0.01" value="${num(m?.overtime_rate || 10)}" />`)}
      ${field("银行名称", `<input name="bank_name" value="${esc(m?.bank_name || "")}" />`)}
      ${field("银行卡号", `<input name="bank_card" value="${esc(m?.bank_card || "")}" />`)}
      ${field("状态", selectHtml("status", ["在职", "停用"], m?.status || "在职"))}
      <button class="btn block" type="submit">保存</button>
    </form>
    <button class="btn weak block" id="backPeople">返回</button>`
  );
  $("#backPeople").onclick = peopleView;
  $("#mf").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target).entries());
    const obj = {
      ...fd,
      daily_rate: num(fd.daily_rate),
      hourly_rate: num(fd.hourly_rate),
      overtime_rate: num(fd.overtime_rate),
    };
    try {
      if (m) await gql(`mutation($id:bigint!,$s:salary_member_set_input!){ update_salary_member(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, { id: m.id, s: obj });
      else await gql(`mutation($o:[salary_member_insert_input!]!){ insert_salary_member(objects:$o){ affected_rows } }`, { o: [obj] });
      toast("已保存");
      peopleView();
    } catch (e) {
      toast(e.message);
    }
  };
}

function productForm(p) {
  shell(
    p ? "编辑型号" : "新增型号",
    `<form class="card" id="pf">
      ${field("产品名称", `<input name="product_name" value="${esc(p?.product_name || "")}" required />`)}
      ${field("型号", `<input name="model" value="${esc(p?.model || "")}" required />`)}
      ${field("工种", selectHtml("work_kind", ["冲压", "焊接", "组装", "铆接", "销售"], p?.work_kind || "组装"))}
      ${field("长期工单价", `<input name="unit_price_regular" type="number" step="0.001" value="${num(p?.unit_price_regular)}" />`)}
      ${field("钟点工单价", `<input name="unit_price_hourly" type="number" step="0.001" value="${num(p?.unit_price_hourly)}" />`)}
      ${field("销售提成", `<input name="commission_rate" type="number" step="0.001" value="${num(p?.commission_rate)}" />`)}
      ${field("状态", selectHtml("status", ["启用", "停用"], p?.status || "启用"))}
      <button class="btn block" type="submit">保存</button>
    </form>
    <button class="btn weak block" id="backPeople">返回</button>`
  );
  $("#backPeople").onclick = peopleView;
  $("#pf").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target).entries());
    const obj = {
      ...fd,
      unit_price_regular: num(fd.unit_price_regular),
      unit_price_hourly: num(fd.unit_price_hourly),
      commission_rate: num(fd.commission_rate),
    };
    try {
      if (p) await gql(`mutation($id:bigint!,$s:salary_product_set_input!){ update_salary_product(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, { id: p.id, s: obj });
      else await gql(`mutation($o:[salary_product_insert_input!]!){ insert_salary_product(objects:$o){ affected_rows } }`, { o: [obj] });
      toast("已保存");
      peopleView();
    } catch (e) {
      toast(e.message);
    }
  };
}

function meView() {
  const m = state.me;
  shell(
    "我的",
    `<div class="card">
      <div class="title">${esc(m.name)}</div>
      <div class="muted">${esc(m.role)} · ${esc(m.hire_type)} · ${esc(m.job_type)}</div>
    </div>
    <form class="card" id="bankForm">
      ${field("银行名称", `<input name="bank_name" value="${esc(m.bank_name || "")}" />`)}
      ${field("银行卡号", `<input name="bank_card" value="${esc(m.bank_card || "")}" />`)}
      <button class="btn block" type="submit">保存银行卡</button>
    </form>
    <button class="btn weak block" id="logout">退出</button>`
  );
  $("#bankForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData(ev.target).entries());
    await gql(`mutation($id:bigint!,$s:salary_member_set_input!){ update_salary_member(where:{id:{_eq:$id}}, _set:$s){ affected_rows } }`, { id: m.id, s: fd });
    state.me = { ...m, ...fd };
    toast("已保存");
  };
  $("#logout").onclick = logout;
}

async function render() {
  if (!state.me) return loginView();
  try {
    if (isAdmin() && (state.tab === "work" || state.tab === "review")) return reviewView();
    if (!isAdmin() && state.tab === "work") return workView();
    if (state.tab === "pay") return payView();
    if (state.tab === "people") return peopleView();
    if (state.tab === "review") return reviewView();
    if (isAdmin()) return reviewView();
    return meView();
  } catch (e) {
    toast(e.message);
  }
}

async function boot() {
  const fromQuery = queryUserId();
  const saved = fromQuery || Number(localStorage.getItem("salary_me_id") || 0);
  if (saved) {
    try {
      const data = await gql(`query($id:bigint!){ salary_member_by_pk(id:$id){ ${MEMBER_FIELDS} } }`, { id: Number(saved) });
      if (data.salary_member_by_pk?.status === "在职") {
        setLoggedIn(data.salary_member_by_pk);
        await loadBase();
        return render();
      }
      if (fromQuery) toast("这个 user 不存在或已停用");
    } catch (_) {}
  }
  loginView();
}

boot();
