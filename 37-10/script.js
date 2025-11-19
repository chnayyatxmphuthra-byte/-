// script.js
// เครื่องคิดเลข: ปลอดภัยด้วย Shunting-Yard -> RPN evaluator
// ฟีเจอร์: ปุ่ม, คีย์บอร์ด, ประวัติ, เปอร์เซ็นต์, ย้อนกลับ, ล้าง

(() => {
  // Element refs
  const exprEl = document.getElementById('expr');
  const resultEl = document.getElementById('result');
  const keys = document.querySelectorAll('.keys .btn');
  const histList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history');

  // State
  let expression = ''; // string expression ที่แสดง
  let history = loadHistory(); // array of {expr, result, time}

  // Utils
  function updateDisplay(){
    exprEl.textContent = expression || '0';
    try {
      const val = expression ? evaluateExpression(expression) : 0;
      resultEl.textContent = formatNumber(val);
    } catch (e) {
      resultEl.textContent = 'Error';
    }
  }

  function formatNumber(n){
    if (typeof n !== 'number' || !isFinite(n)) return 'Error';
    // จำกัดทศนิยมไม่เกิน 12 หลัก (ถ้าจำเป็น)
    const abs = Math.abs(n);
    if (abs < 1e12 && Number.isInteger(n)) return n.toString();
    // else format with up to 12 significant digits, remove trailing zeros
    let s = n.toPrecision(12);
    // remove trailing zeros and possible trailing dot
    s = s.replace(/(?:\.0+|(\.\d+?)0+)$/,'$1');
    return s;
  }

  // Button handlers
  keys.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.value;
      const action = btn.dataset.action;
      if (action) handleAction(action);
      else if (v) handleInput(v);
      updateDisplay();
    });
  });

  function handleInput(ch){
    // Basic validation to keep expression sane
    const last = expression.slice(-1);
    // If ch is digit or dot or parenthesis or operator symbol
    if (isDigit(ch) || ch === '.') {
      expression += ch;
      return;
    }
    if (isOperator(ch)) {
      // prevent two operators in a row (allow unary minus if start or after '(')
      if (!expression) {
        if (ch === '-') expression += ch; // unary minus
        return;
      }
      if (isOperator(last) && !(ch === '-' && last === '(')) {
        // replace operator (except allow ( - for unary)
        expression = expression.slice(0, -1) + ch;
      } else {
        expression += ch;
      }
      return;
    }
    if (ch === '(') {
      // if previous char is a digit or ')', insert implicit multiplication
      if (last && (isDigit(last) || last === ')')) expression += '*';
      expression += '(';
      return;
    }
    if (ch === ')') {
      expression += ')';
      return;
    }
  }

  function handleAction(action){
    if (action === 'clear') {
      expression = '';
      updateDisplay();
    } else if (action === 'back') {
      expression = expression.slice(0, -1);
      updateDisplay();
    } else if (action === 'percent') {
      // Add percent operator: we will treat '%' as a postfix operator dividing the immediate number by 100
      // To keep expression consistent, append '%' char.
      // If last is a digit or ')', allow %
      const last = expression.slice(-1);
      if (last && (isDigit(last) || last === ')' )) expression += '%';
    } else if (action === 'equals') {
      try {
        const value = evaluateExpression(expression || '0');
        const formatted = formatNumber(value);
        // push to history
        pushHistory({expr: expression || '0', result: formatted, time: Date.now()});
        expression = formatted; // show the computed value as the new expression
        updateDisplay();
      } catch (e) {
        resultEl.textContent = 'Error';
      }
    }
  }

  // Keyboard support
  window.addEventListener('keydown', (ev) => {
    const key = ev.key;
    if (key === 'Enter' || key === '=') { ev.preventDefault(); handleAction('equals'); updateDisplay(); return; }
    if (key === 'Backspace') { ev.preventDefault(); handleAction('back'); updateDisplay(); return; }
    if (key === 'Escape') { ev.preventDefault(); handleAction('clear'); updateDisplay(); return; }
    if (key === '%') { ev.preventDefault(); handleAction('percent'); updateDisplay(); return; }
    if (key === '(' || key === ')') { ev.preventDefault(); handleInput(key); updateDisplay(); return; }
    if (key === '.' ) { ev.preventDefault(); handleInput('.'); updateDisplay(); return; }
    if ('+-*/'.includes(key)) { ev.preventDefault(); handleInput(key); updateDisplay(); return; }
    if (/\d/.test(key)) { ev.preventDefault(); handleInput(key); updateDisplay(); return; }
  });

  // History management
  function pushHistory(item){
    history.unshift(item);
    if (history.length > 50) history.length = 50;
    saveHistory();
    renderHistory();
  }
  function saveHistory(){
    try { localStorage.setItem('calc_history_v1', JSON.stringify(history)); }
    catch(e){}
  }
  function loadHistory(){
    try {
      const raw = localStorage.getItem('calc_history_v1');
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }
  function renderHistory(){
    histList.innerHTML = '';
    if (!history.length) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = '<span class="h-expr">ยังไม่มีประวัติ</span>';
      histList.appendChild(li);
      return;
    }
    history.forEach((h, idx) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const left = document.createElement('div');
      left.className = 'h-expr';
      left.textContent = h.expr;
      const right = document.createElement('div');
      right.className = 'h-res';
      right.textContent = h.result;
      li.appendChild(left);
      li.appendChild(right);
      // allow click to reuse
      li.addEventListener('click', () => {
        expression = h.result.toString();
        updateDisplay();
      });
      histList.appendChild(li);
    });
  }
  clearHistoryBtn.addEventListener('click', () => {
    history = [];
    saveHistory();
    renderHistory();
  });

  // Initial render
  renderHistory();
  updateDisplay();

  /************* Expression evaluation (Shunting-Yard -> RPN) *************/
  // Supported tokens: numbers (with decimal), operators + - * /, parentheses, percent %
  // % is a postfix operator that divides the previous number by 100
  function isDigit(ch){ return /\d/.test(ch); }
  function isOperator(ch){ return ['+','-','*','/'].includes(ch); }

  function tokenize(expr){
    const tokens = [];
    let i = 0;
    while (i < expr.length){
      const ch = expr[i];
      if (ch === ' ') { i++; continue; }
      if (/\d|\./.test(ch)){
        // number (allow decimal)
        let num = ch;
        i++;
        while (i < expr.length && /[\d.]/.test(expr[i])){
          num += expr[i++];
        }
        // guard: multiple dots -> throw
        if ((num.match(/\./g) || []).length > 1) throw new Error('Invalid number');
        tokens.push({type:'number', value: parseFloat(num)});
        continue;
      }
      if (isOperator(ch)){
        tokens.push({type:'op', value:ch});
        i++; continue;
      }
      if (ch === '(' || ch === ')'){
        tokens.push({type: ch === '(' ? 'lparen' : 'rparen', value: ch});
        i++; continue;
      }
      if (ch === '%'){
        tokens.push({type:'percent', value:'%'}); i++; continue;
      }
      // unsupported char
      throw new Error('Invalid char: ' + ch);
    }
    return tokens;
  }

  function precedence(op){
    if (op === '+' || op === '-') return 1;
    if (op === '*' || op === '/') return 2;
    return 0;
  }

  function toRPN(tokens){
    const output = [];
    const ops = [];
    for (let i=0;i<tokens.length;i++){
      const token = tokens[i];
      if (token.type === 'number') {
        output.push(token);
      } else if (token.type === 'percent') {
        // percent is postfix: push as operator with special handling
        output.push(token);
      } else if (token.type === 'op') {
        // handle unary minus: if previous token is absent or was operator or left paren, this minus is unary
        const prev = tokens[i-1];
        if (token.value === '-' && (!prev || (prev.type !== 'number' && prev.type !== 'rparen' && prev.type !== 'percent'))){
          // unary minus -> treat as multiplication by -1: push number -1 and * operator, but better to push unary operator
          // Simpler: push number 0 and binary minus: e.g., -5 => 0 5 - . We'll transform by inserting a zero
          output.push({type:'number', value:0});
        }
        while (ops.length && ops[ops.length-1].type === 'op' && precedence(ops[ops.length-1].value) >= precedence(token.value)){
          output.push(ops.pop());
        }
        ops.push(token);
      } else if (token.type === 'lparen') {
        ops.push(token);
      } else if (token.type === 'rparen') {
        while (ops.length && ops[ops.length-1].type !== 'lparen'){
          output.push(ops.pop());
        }
        if (!ops.length) throw new Error('Mismatched parentheses');
        ops.pop(); // remove left paren
      } else {
        throw new Error('Unknown token type: ' + token.type);
      }
    }
    while (ops.length){
      const op = ops.pop();
      if (op.type === 'lparen' || op.type === 'rparen') throw new Error('Mismatched parentheses');
      output.push(op);
    }
    return output;
  }

  function evalRPN(rpn){
    const st = [];
    for (let i=0;i<rpn.length;i++){
      const t = rpn[i];
      if (t.type === 'number'){
        st.push(t.value);
      } else if (t.type === 'percent'){
        if (!st.length) throw new Error('Bad percent usage');
        const a = st.pop();
        st.push(a / 100);
      } else if (t.type === 'op'){
        if (st.length < 2) throw new Error('Insufficient operands');
        const b = st.pop();
        const a = st.pop();
        let res;
        switch (t.value){
          case '+': res = a + b; break;
          case '-': res = a - b; break;
          case '*': res = a * b; break;
          case '/':
            if (b === 0) throw new Error('Division by zero');
            res = a / b; break;
          default: throw new Error('Unknown op');
        }
        st.push(res);
      } else {
        throw new Error('Unknown RPN token');
      }
    }
    if (st.length !== 1) throw new Error('Invalid expression');
    return st[0];
  }

  function evaluateExpression(expr){
    if (!expr) return 0;
    // replace '×' '÷' '−' with normalized operators in case user typed product symbol from UI
    expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    const tokens = tokenize(expr);
    const rpn = toRPN(tokens);
    const val = evalRPN(rpn);
    return val;
  }

})();
