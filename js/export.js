import { APP_NAME, LEAD_STATUS, TASK_STATUS } from './config.js?v=1.1.0';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const dateBR = value => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${String(value).slice(0,10)}T12:00:00`)) : '';
const dateTimeBR = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';
const statusMap = Object.fromEntries(LEAD_STATUS);
const taskStatusMap = Object.fromEntries(TASK_STATUS);

function downloadBlob(content, type, fileName) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportJSON(data, referenceMonth) {
  const payload = {
    application: APP_NAME,
    exported_at: new Date().toISOString(),
    reference_month: referenceMonth,
    data
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'application/json;charset=utf-8', `backup-evolua-crm-${referenceMonth}.json`);
}

export function exportExcel(data, referenceMonth, helpers) {
  if (!window.XLSX) throw new Error('Biblioteca de Excel não carregada. Atualize a página e tente novamente.');
  const { sourceName, courseNames, leadName, enrollmentName } = helpers;

  const sheets = {
    Leads: data.leads.map(lead => ({
      Nome: lead.full_name,
      WhatsApp: lead.whatsapp || '',
      Telefone: lead.phone || '',
      Email: lead.email || '',
      Cidade: lead.city || '',
      Origem: sourceName(lead.source_id),
      Campanha: lead.campaign || '',
      Modalidade: lead.modality || '',
      Temperatura: lead.temperature,
      Status: statusMap[lead.status] || lead.status,
      Cursos: courseNames(lead.id).join(', '),
      'Próxima ação': lead.next_action || '',
      'Próximo contato': dateTimeBR(lead.next_contact_at),
      Observações: lead.notes || '',
      'Motivo da perda': lead.lost_reason || '',
      'Data de entrada': dateTimeBR(lead.created_at)
    })),
    Atendimentos: data.interactions.map(item => ({
      Lead: leadName(item.lead_id),
      Canal: item.channel,
      Resumo: item.summary,
      Objeções: item.objections || '',
      'Valor proposto': Number(item.proposal_amount || 0),
      Resultado: item.outcome || '',
      'Próxima ação': item.next_action || '',
      Data: dateTimeBR(item.occurred_at)
    })),
    Agenda: data.tasks.map(task => ({
      Título: task.title,
      Lead: leadName(task.lead_id),
      Tipo: task.task_type,
      Prioridade: task.priority,
      Status: taskStatusMap[task.status] || task.status,
      Prazo: dateTimeBR(task.due_at),
      Lembrete: dateTimeBR(task.reminder_at),
      'Aviso enviado': dateTimeBR(task.reminder_sent_at),
      'Prazo anterior': dateTimeBR(task.previous_due_at),
      Reagendada: dateTimeBR(task.rescheduled_at),
      Concluída: dateTimeBR(task.completed_at),
      Descrição: task.description || ''
    })),
    'Histórico Tarefas': (data.taskHistory || []).map(item => ({
      Tarefa: item.task_title || '',
      Ação: item.action_label || item.action || '',
      'Status anterior': item.old_status ? (taskStatusMap[item.old_status] || item.old_status) : '',
      'Novo status': item.new_status ? (taskStatusMap[item.new_status] || item.new_status) : '',
      'Prazo anterior': dateTimeBR(item.old_due_at),
      'Novo prazo': dateTimeBR(item.new_due_at),
      Detalhes: item.details || '',
      Data: dateTimeBR(item.changed_at)
    })),
    Matriculas: data.enrollments.map(item => ({
      Aluno: item.student_name,
      Lead: leadName(item.lead_id),
      Curso: item.courses?.name || '',
      Data: dateBR(item.enrollment_date),
      'Valor do contrato': Number(item.contract_value || 0),
      'Taxa de matrícula': Number(item.enrollment_fee || 0),
      'Valor total': Number(item.total_contract_value || 0),
      Parcelas: item.installments,
      'Valor da parcela': Number(item.installment_value || 0),
      'Forma de pagamento': item.payment_method || '',
      Status: item.status,
      Observações: item.notes || ''
    })),
    Recebimentos: data.payments.map(item => ({
      Matrícula: enrollmentName(item.enrollment_id),
      Descrição: item.description || '',
      Parcela: item.installment_number || '',
      Valor: Number(item.amount || 0),
      Status: item.status,
      'Forma de pagamento': item.payment_method || '',
      Vencimento: dateBR(item.due_date),
      Recebido: dateTimeBR(item.paid_at),
      Observações: item.notes || ''
    })),
    Planejamento: data.plans.map(plan => ({
      Mês: dateBR(plan.reference_month),
      'Meta de leads': plan.target_leads,
      'Meta de propostas': plan.target_proposals,
      'Meta de matrículas': plan.target_enrollments,
      'Meta receita gerada': Number(plan.target_generated_revenue || 0),
      'Meta faturamento recebido': Number(plan.target_received_revenue || 0),
      'Meta ticket médio': Number(plan.target_average_ticket || 0),
      'Meta conversão (%)': Number(plan.target_conversion_rate || 0),
      'Cursos prioritários': plan.priority_courses || '',
      Campanhas: plan.campaigns || '',
      'Orçamento de anúncios': Number(plan.ad_budget || 0),
      Observações: plan.notes || ''
    })),
    '5W2H': data.actions.map(action => ({
      Planejamento: action.monthly_plan_id,
      'O quê': action.what_action,
      'Por quê': action.why_action || '',
      Onde: action.where_action || '',
      Quando: `${dateBR(action.start_date)} a ${dateBR(action.end_date)}`,
      Quem: action.responsible || '',
      Como: action.how_action || '',
      Quanto: Number(action.estimated_cost || 0),
      Status: action.status,
      'Progresso (%)': action.progress,
      Resultado: action.result || ''
    }))
  };

  const workbook = window.XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    const sheet = window.XLSX.utils.json_to_sheet(rows.length ? rows : [{ Informação: 'Nenhum registro' }]);
    const ref = sheet['!ref'];
    if (ref) {
      const range = window.XLSX.utils.decode_range(ref);
      sheet['!cols'] = Array.from({ length: range.e.c + 1 }, (_, col) => {
        let width = 12;
        for (let row = range.s.r; row <= range.e.r; row += 1) {
          const cell = sheet[window.XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell?.v != null) width = Math.min(45, Math.max(width, String(cell.v).length + 2));
        }
        return { wch: width };
      });
    }
    window.XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
  });
  window.XLSX.writeFile(workbook, `evolua-crm-${referenceMonth}.xlsx`);
}

export function exportPDF(data, referenceMonth, metrics, helpers) {
  if (!window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF não carregada. Atualize a página e tente novamente.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const left = 16;
  let y = 18;

  function header() {
    doc.setFillColor(91, 33, 182);
    doc.roundedRect(left, y, pageWidth - 32, 24, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('EVOLUA CRM COMERCIAL', left + 7, y + 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Relatório executivo | ${helpers.monthLabel(referenceMonth)}`, left + 7, y + 17);
    y += 34;
    doc.setTextColor(25, 20, 31);
  }

  function checkPage(height = 20) {
    if (y + height > 280) {
      doc.addPage();
      y = 18;
    }
  }

  function title(text) {
    checkPage(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(91, 33, 182);
    doc.text(text, left, y);
    y += 7;
    doc.setTextColor(25, 20, 31);
  }

  function line(label, value) {
    checkPage(8);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(105, 95, 115);
    doc.text(label, left, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(25, 20, 31);
    doc.text(String(value), 94, y, { align: 'left' });
    y += 6;
  }

  header();
  title('Resumo do mês');
  line('Leads cadastrados', metrics.monthLeads);
  line('Matrículas realizadas', metrics.monthEnrollments);
  line('Taxa de conversão', `${metrics.conversionRate.toFixed(1)}%`);
  line('Receita comercial gerada', money(metrics.generatedRevenue));
  line('Faturamento recebido', money(metrics.receivedRevenue));
  line('Ticket médio', money(metrics.averageTicket));
  line('Follow-ups atrasados', metrics.overdueTasks);
  y += 5;

  title('Funil comercial');
  LEAD_STATUS.forEach(([key, label]) => line(label, data.leads.filter(l => l.status === key).length));
  y += 5;

  const plan = helpers.currentPlan();
  title('Metas e direção');
  if (plan) {
    line('Meta de matrículas', plan.target_enrollments);
    line('Meta de receita gerada', money(plan.target_generated_revenue));
    line('Meta de faturamento recebido', money(plan.target_received_revenue));
    line('Cursos prioritários', plan.priority_courses || 'Não informado');
    line('Campanhas', plan.campaigns || 'Não informado');
  } else {
    line('Planejamento', 'Ainda não cadastrado para este mês');
  }
  y += 5;

  title('Próximas prioridades');
  const pending = data.tasks
    .filter(task => ['pendente', 'em_andamento'].includes(task.status))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 8);
  if (!pending.length) line('Agenda', 'Nenhuma tarefa pendente');
  pending.forEach(task => {
    checkPage(12);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(task.title.slice(0, 72), left, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(105,95,115);
    doc.text(`${dateTimeBR(task.due_at)} | ${helpers.leadName(task.lead_id) || 'Sem lead'}`, left, y);
    doc.setTextColor(25,20,31);
    y += 7;
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(140,130,148);
    doc.text(`Gerado em ${dateTimeBR(new Date().toISOString())} • Página ${i}/${pages}`, pageWidth / 2, 291, { align: 'center' });
  }
  doc.save(`relatorio-evolua-crm-${referenceMonth}.pdf`);
}
