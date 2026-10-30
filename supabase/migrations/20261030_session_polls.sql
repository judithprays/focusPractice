-- Shared Focus Practice polls. Votes persist server-side across visitors and devices.
create table if not exists public.session_poll_votes (
  session_id text not null,
  voter_key uuid not null,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (session_id, voter_key)
);
alter table public.session_poll_votes enable row level security;
revoke all on public.session_poll_votes from anon, authenticated;

create or replace function public.get_session_poll_results(p_session_id text, p_voter_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_body text;
  v_owner_id uuid;
  v_poll jsonb;
  v_counts jsonb;
  v_total integer;
  v_my_vote integer;
  v_show_results boolean;
  v_options_count integer;
begin
  select s.body, f.owner_id into v_body, v_owner_id
  from public.sessions s join public.focuses f on f.id = s.focus_id
  where s.id::text = p_session_id;
  if not found then return jsonb_build_object('show_results', false, 'option_counts', '[]'::jsonb, 'total_votes', 0, 'my_vote', null); end if;
  begin
    v_poll := substring(coalesce(v_body, '') from '\[focus-poll\]([\s\S]*?)\[/focus-poll\]')::jsonb;
  exception when others then
    return jsonb_build_object('show_results', false, 'option_counts', '[]'::jsonb, 'total_votes', 0, 'my_vote', null);
  end;
  if jsonb_typeof(v_poll->'options') <> 'array' then
    return jsonb_build_object('show_results', false, 'option_counts', '[]'::jsonb, 'total_votes', 0, 'my_vote', null);
  end if;
  v_options_count := jsonb_array_length(v_poll->'options');
  select coalesce(jsonb_agg(coalesce(v.vote_count, 0) order by options.option_no), '[]'::jsonb)
  into v_counts
  from generate_series(0, greatest(v_options_count - 1, 0)) as options(option_no)
  left join (
    select option_index, count(*)::integer as vote_count
    from public.session_poll_votes where session_id = p_session_id group by option_index
  ) v on v.option_index = options.option_no;
  select count(*)::integer into v_total from public.session_poll_votes where session_id = p_session_id;
  select option_index into v_my_vote from public.session_poll_votes where session_id = p_session_id and voter_key = p_voter_key;
  v_show_results := (auth.uid() is not null and auth.uid() = v_owner_id) or v_my_vote is not null;
  return jsonb_build_object('show_results', v_show_results, 'option_counts', v_counts, 'total_votes', v_total, 'my_vote', v_my_vote);
end;
$$;

create or replace function public.cast_session_poll_vote(p_session_id text, p_option_index integer, p_voter_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_body text;
  v_owner_id uuid;
  v_poll jsonb;
  v_options_count integer;
begin
  select s.body, f.owner_id into v_body, v_owner_id
  from public.sessions s join public.focuses f on f.id = s.focus_id
  where s.id::text = p_session_id;
  if not found then raise exception 'Poll not found'; end if;
  if auth.uid() is not null and auth.uid() = v_owner_id then raise exception 'Poll owners already have access to results'; end if;
  begin
    v_poll := substring(coalesce(v_body, '') from '\[focus-poll\]([\s\S]*?)\[/focus-poll\]')::jsonb;
  exception when others then raise exception 'Poll not found'; end;
  if jsonb_typeof(v_poll->'options') <> 'array' then raise exception 'Poll not found'; end if;
  v_options_count := jsonb_array_length(v_poll->'options');
  if p_option_index < 0 or p_option_index >= v_options_count then raise exception 'Invalid poll option'; end if;
  insert into public.session_poll_votes(session_id, voter_key, option_index)
  values (p_session_id, p_voter_key, p_option_index)
  on conflict (session_id, voter_key) do update set option_index = excluded.option_index, created_at = now();
  return public.get_session_poll_results(p_session_id, p_voter_key);
end;
$$;

grant execute on function public.get_session_poll_results(text, uuid) to anon, authenticated;
grant execute on function public.cast_session_poll_vote(text, integer, uuid) to anon, authenticated;


-- Update poll content and clear old responses atomically so results never refer
-- to answer choices that have since changed.
create or replace function public.update_session_poll(p_session_id text, p_question text, p_options jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_owner_id uuid;
  v_open_tag text := '[focus-poll]';
  v_close_tag text := '[/focus-poll]';
  v_start integer;
  v_end integer;
  v_poll_text text;
  v_new_body text;
begin
  if auth.uid() is null then raise exception 'Sign in to edit this poll'; end if;
  if nullif(trim(p_question), '') is null or length(p_question) > 180 then raise exception 'Enter a valid poll question'; end if;
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 or jsonb_array_length(p_options) > 12 then raise exception 'A poll needs between 2 and 12 options'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_options) option_text where nullif(trim(option_text), '') is null or length(option_text) > 180) then raise exception 'Each option must contain 1 to 180 characters'; end if;

  select s.body, f.owner_id into v_body, v_owner_id
  from public.sessions s join public.focuses f on f.id = s.focus_id
  where s.id::text = p_session_id;
  if not found or v_owner_id <> auth.uid() then raise exception 'You cannot edit this poll'; end if;

  v_start := strpos(coalesce(v_body, ''), v_open_tag);
  v_end := strpos(coalesce(v_body, ''), v_close_tag);
  if v_start = 0 or v_end < v_start then raise exception 'Poll not found'; end if;
  v_poll_text := '[focus-poll]' || jsonb_build_object('question', trim(p_question), 'options', p_options)::text || '[/focus-poll]';
  v_new_body := substr(v_body, 1, v_start - 1) || v_poll_text || substr(v_body, v_end + length(v_close_tag));
  update public.sessions set body = v_new_body where id::text = p_session_id;
  delete from public.session_poll_votes where session_id = p_session_id;
end;
$$;

grant execute on function public.update_session_poll(text, text, jsonb) to authenticated;
