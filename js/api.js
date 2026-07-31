import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js?v=1.1.0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

function unwrap(result, context = 'operação') {
  if (result.error) {
    const error = new Error(result.error.message || `Falha na ${context}.`);
    error.details = result.error;
    throw error;
  }
  return result.data;
}

export class CRMService {
  constructor(client) {
    this.client = client;
    this.workspaceId = null;
    this.user = null;
  }

  async bootstrap(user) {
    this.user = user;
    const { data, error } = await this.client.rpc('bootstrap_current_user', {
      workspace_name: 'Evolua CRM Comercial'
    });
    if (error) throw error;
    this.workspaceId = data;
    return data;
  }

  async getProfile() {
    const result = await this.client
      .from('profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();
    return unwrap(result, 'consulta do perfil');
  }

  async getAllData() {
    const ws = this.workspaceId;
    const [
      courses, sources, leads, interests, interactions, tasks, taskHistory,
      enrollments, payments, plans, actions
    ] = await Promise.all([
      this.client.from('courses').select('*').eq('workspace_id', ws).order('name'),
      this.client.from('lead_sources').select('*').eq('workspace_id', ws).order('name'),
      this.client.from('leads').select('*').eq('workspace_id', ws).order('created_at', { ascending: false }),
      this.client.from('lead_interests').select('*, courses(name)').eq('workspace_id', ws),
      this.client.from('interactions').select('*').eq('workspace_id', ws).order('occurred_at', { ascending: false }),
      this.client.from('tasks').select('*').eq('workspace_id', ws).order('due_at', { ascending: true }),
      this.client.from('task_history').select('*').eq('workspace_id', ws).order('changed_at', { ascending: false }),
      this.client.from('enrollments').select('*, courses(name), leads(full_name)').eq('workspace_id', ws).order('enrollment_date', { ascending: false }),
      this.client.from('payments').select('*, enrollments(student_name)').eq('workspace_id', ws).order('paid_at', { ascending: false, nullsFirst: false }),
      this.client.from('monthly_plans').select('*').eq('workspace_id', ws).order('reference_month', { ascending: false }),
      this.client.from('sw2h_actions').select('*').eq('workspace_id', ws).order('created_at', { ascending: false })
    ]);

    return {
      courses: unwrap(courses, 'consulta dos cursos'),
      sources: unwrap(sources, 'consulta das origens'),
      leads: unwrap(leads, 'consulta dos leads'),
      interests: unwrap(interests, 'consulta dos interesses'),
      interactions: unwrap(interactions, 'consulta dos atendimentos'),
      tasks: unwrap(tasks, 'consulta das tarefas'),
      taskHistory: unwrap(taskHistory, 'consulta do histórico das tarefas'),
      enrollments: unwrap(enrollments, 'consulta das matrículas'),
      payments: unwrap(payments, 'consulta dos pagamentos'),
      plans: unwrap(plans, 'consulta dos planejamentos'),
      actions: unwrap(actions, 'consulta do 5W2H')
    };
  }

  async saveLead(payload, courseIds = [], id = null) {
    let lead;
    if (id) {
      const result = await this.client.from('leads').update(payload).eq('id', id).select().single();
      lead = unwrap(result, 'atualização do lead');
      unwrap(await this.client.from('lead_interests').delete().eq('lead_id', id), 'atualização dos interesses');
    } else {
      const result = await this.client.from('leads').insert({
        ...payload,
        workspace_id: this.workspaceId,
        created_by: this.user.id
      }).select().single();
      lead = unwrap(result, 'cadastro do lead');
    }

    if (courseIds.length) {
      const rows = courseIds.map(courseId => ({
        workspace_id: this.workspaceId,
        lead_id: lead.id,
        course_id: courseId
      }));
      unwrap(await this.client.from('lead_interests').insert(rows), 'cadastro dos cursos de interesse');
    }
    return lead;
  }

  async updateLeadStatus(id, status) {
    return unwrap(await this.client.from('leads').update({ status }).eq('id', id).select().single(), 'mudança de status');
  }

  async deleteLead(id) {
    return unwrap(await this.client.from('leads').delete().eq('id', id), 'exclusão do lead');
  }

  async saveInteraction(payload, id = null) {
    if (id) {
      return unwrap(
        await this.client.from('interactions').update(payload).eq('id', id).select().single(),
        'atualização do atendimento'
      );
    }
    return unwrap(await this.client.from('interactions').insert({
      ...payload,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }).select().single(), 'registro do atendimento');
  }

  async deleteInteraction(id) {
    return unwrap(await this.client.from('interactions').delete().eq('id', id), 'exclusão do atendimento');
  }

  async saveTask(payload, id = null) {
    if (id) {
      return unwrap(
        await this.client.from('tasks').update(payload).eq('id', id).select().single(),
        'atualização da tarefa'
      );
    }
    return unwrap(await this.client.from('tasks').insert({
      ...payload,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }).select().single(), 'cadastro da tarefa');
  }

  async updateTaskStatus(id, status) {
    return unwrap(await this.client.from('tasks').update({
      status,
      completed_at: status === 'concluida' ? new Date().toISOString() : null
    }).eq('id', id).select().single(), 'alteração do status da tarefa');
  }

  async markReminderSent(id) {
    return unwrap(await this.client.from('tasks').update({
      reminder_sent_at: new Date().toISOString()
    }).eq('id', id).select().single(), 'registro do lembrete');
  }

  async deleteTask(id) {
    return unwrap(await this.client.from('tasks').delete().eq('id', id), 'exclusão da tarefa');
  }

  async saveEnrollment(payload, id = null) {
    let enrollment;
    if (id) {
      enrollment = unwrap(await this.client.from('enrollments').update(payload).eq('id', id).select().single(), 'atualização da matrícula');
    } else {
      enrollment = unwrap(await this.client.from('enrollments').insert({
        ...payload,
        workspace_id: this.workspaceId,
        created_by: this.user.id
      }).select().single(), 'cadastro da matrícula');
    }
    if (payload.lead_id) {
      await this.client.from('leads').update({ status: 'matriculado' }).eq('id', payload.lead_id);
    }
    return enrollment;
  }

  async deleteEnrollment(id) {
    return unwrap(await this.client.from('enrollments').delete().eq('id', id), 'exclusão da matrícula');
  }

  async savePayment(payload, id = null) {
    if (id) return unwrap(await this.client.from('payments').update(payload).eq('id', id).select().single(), 'atualização do recebimento');
    return unwrap(await this.client.from('payments').insert({
      ...payload,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }).select().single(), 'cadastro do recebimento');
  }

  async deletePayment(id) {
    return unwrap(await this.client.from('payments').delete().eq('id', id), 'exclusão do recebimento');
  }

  async savePlan(payload, id = null) {
    if (id) return unwrap(await this.client.from('monthly_plans').update(payload).eq('id', id).select().single(), 'atualização do planejamento');
    return unwrap(await this.client.from('monthly_plans').upsert({
      ...payload,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }, { onConflict: 'workspace_id,reference_month' }).select().single(), 'cadastro do planejamento');
  }

  async deletePlan(id) {
    return unwrap(await this.client.from('monthly_plans').delete().eq('id', id), 'exclusão do planejamento');
  }

  async saveAction(payload, id = null) {
    if (id) return unwrap(await this.client.from('sw2h_actions').update(payload).eq('id', id).select().single(), 'atualização da ação');
    return unwrap(await this.client.from('sw2h_actions').insert({
      ...payload,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }).select().single(), 'cadastro da ação');
  }

  async deleteAction(id) {
    return unwrap(await this.client.from('sw2h_actions').delete().eq('id', id), 'exclusão da ação');
  }

  async saveCourse(payload, id = null) {
    if (id) {
      return unwrap(
        await this.client.from('courses').update(payload).eq('id', id).select().single(),
        'atualização do curso'
      );
    }
    return unwrap(await this.client.from('courses').insert({
      ...payload,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }).select().single(), 'cadastro do curso');
  }

  async toggleCourse(id, active) {
    return unwrap(await this.client.from('courses').update({ active }).eq('id', id).select().single(), 'alteração do curso');
  }

  async deleteCourse(id) {
    return unwrap(await this.client.from('courses').delete().eq('id', id), 'exclusão do curso');
  }

  async saveSource(name, id = null) {
    if (id) {
      return unwrap(
        await this.client.from('lead_sources').update({ name }).eq('id', id).select().single(),
        'atualização da origem'
      );
    }
    return unwrap(await this.client.from('lead_sources').insert({
      name,
      workspace_id: this.workspaceId,
      created_by: this.user.id
    }).select().single(), 'cadastro da origem');
  }

  async toggleSource(id, active) {
    return unwrap(await this.client.from('lead_sources').update({ active }).eq('id', id).select().single(), 'alteração da origem');
  }

  async deleteSource(id) {
    return unwrap(await this.client.from('lead_sources').delete().eq('id', id), 'exclusão da origem');
  }
}

export const crm = new CRMService(supabase);
