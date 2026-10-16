(function(){
	var cfg=window.neoPulseBackendAssist||{};
	var baseUrl=cfg.baseUrl||'';
	var stepUrl=cfg.stepUrl||'';
	var undoUrl=cfg.undoUrl||'';
	var workflowStatusBase=cfg.workflowStatusBase||'';
	var sessionsUrl=cfg.sessionsUrl||'';
	var chatAjaxUrl=cfg.chatAjaxUrl||'';
	var chatStreamNonce=cfg.chatStreamNonce||'';
	var nonce=cfg.nonce||'';
	var FBA_BRAIN_SVG=cfg.brainSvg||'';
	var msgs=document.getElementById('fba-messages');
	var input=document.getElementById('fba-input');
	var btn=document.getElementById('fba-send');
	var center=document.getElementById('fba-center');
	var chips=document.querySelectorAll('.fba-chip[data-prompt]');
	var sidebarList=document.getElementById('fba-sidebar-list');
	var newChatBtn=document.getElementById('fba-new-chat');
	var clearMemBtn=document.getElementById('fba-clear-memory');

	var history=[],loading=false;
	var currentSessionId='';
	var assistMode='backend';

	if(!msgs||!input||!btn)return;

	try{
		var storedMode=sessionStorage.getItem('neo-pulse_fba_mode');
		if(storedMode==='chat'||storedMode==='backend'){assistMode=storedMode;}
	}catch(_){}

	try{
		var prefill=sessionStorage.getItem('neo-pulse_fba_prefill');
		if(prefill&&input){
			input.value=prefill;
			input.focus();
			sessionStorage.removeItem('neo-pulse_fba_prefill');
			var taskId=sessionStorage.getItem('neo-pulse_fba_prefill_task_id')||'';
			sessionStorage.removeItem('neo-pulse_fba_prefill_task_id');
			if(taskId&&msgs){
				var note=document.createElement('div');
				note.className='fba-card fba-card--prompt';
				note.innerHTML='<div class="fba-card-body"><p>Overseer task loaded. Review the prompt below and click Send when ready.</p></div>';
				msgs.appendChild(note);
				msgs.scrollTop=msgs.scrollHeight;
			}
		}
	}catch(_){}

	var modeToggle=document.getElementById('fba-mode-toggle');
	var modeBtns=modeToggle?modeToggle.querySelectorAll('.fba-mode-btn'):[];
	function setAssistMode(mode){
		assistMode=mode==='chat'?'chat':'backend';
		try{sessionStorage.setItem('neo-pulse_fba_mode',assistMode);}catch(_){}
		for(var m=0;m<modeBtns.length;m++){
			var on=modeBtns[m].getAttribute('data-mode')===assistMode;
			modeBtns[m].classList.toggle('fba-mode-btn--active',on);
		}
	}
	setAssistMode(assistMode);
	for(var mb=0;mb<modeBtns.length;mb++){
		modeBtns[mb].addEventListener('click',function(){
			setAssistMode(this.getAttribute('data-mode')||'backend');
		});
	}

	btn.addEventListener('click',function(){
		if(input.value.trim()){send();}
	});
	function fbaApplyCardBadge(badgeEl,t){
		var type=t||'answer';
		badgeEl.className='fba-card-badge'+(type==='action'?' fba-card-badge--action':type==='error'?' fba-card-badge--error':type==='prompt'?' fba-card-badge--prompt':type==='workflow'?' fba-card-badge--workflow':'');
		badgeEl.textContent=type==='prompt'?'info':type;
	}
	function fbaThinkingHost(){
		return {
			brainSvg:FBA_BRAIN_SVG,
			appendWorkflowCard:appendWorkflowCard,
			setWorkflowStepStatus:setWorkflowStepStatus,
			setWorkflowCardActive:setWorkflowCardActive,
			applyCardBadge:fbaApplyCardBadge,
			renderMd:renderMd,
			populateCardExtras:function(shell,card){populateCardLinksAndActions(shell.root,card,shell);},
			scrollDown:scrollDown
		};
	}
	function presentCard(card,opts){
		opts=opts||{};
		var shell=opts.shell;
		var host=fbaThinkingHost();
		if(shell&&window.NeoPulseThinkingCard){
			NeoPulseThinkingCard.finalizeToCard(shell,card,host);
		}else{
			appendCard(card);
		}
		if(opts.finish){opts.finish();}else{finishAssistantCard(card);}
		return Promise.resolve();
	}

	input.addEventListener('keydown',function(e){
		if(e.key==='Enter'){
			e.preventDefault();
			send();
		}
	});

	function bindVoiceWhenReady(){
		if(!window.NeoPulseVoice||typeof window.NeoPulseVoice.bindPtt!=='function'){
			setTimeout(bindVoiceWhenReady,50);
			return;
		}
		NeoPulseVoice.bindPtt(btn,input,{
			isLoading:function(){return loading;},
			onTranscript:function(text){deliverMessage(text);},
			onError:function(msg){showVoiceToast(msg);}
		});
	}
	bindVoiceWhenReady();

	for(var i=0;i<chips.length;i++){
		chips[i].addEventListener('click',function(){
			var prompt=this.getAttribute('data-prompt');
			if(prompt){input.value=prompt;send();}
		});
	}

	if(newChatBtn)newChatBtn.addEventListener('click',startNewChat);
	if(clearMemBtn)clearMemBtn.addEventListener('click',clearMemory);

	loadSessionList();

	function postJson(url,payload){
		return new Promise(function(resolve,reject){
			var xhr=new XMLHttpRequest();
			xhr.open('POST',url,true);
			xhr.setRequestHeader('Content-Type','application/json');
			xhr.setRequestHeader('X-WP-Nonce',nonce);
			xhr.onload=function(){
				var data;try{data=JSON.parse(xhr.responseText);}catch(_){data=null;}
				resolve({ok:xhr.status>=200&&xhr.status<300,status:xhr.status,data:data});
			};
			xhr.onerror=function(){reject(new Error('network'));};
			xhr.send(JSON.stringify(payload));
		});
	}

	function getJson(url){
		return new Promise(function(resolve,reject){
			var xhr=new XMLHttpRequest();
			xhr.open('GET',url,true);
			xhr.setRequestHeader('X-WP-Nonce',nonce);
			xhr.onload=function(){
				var data;try{data=JSON.parse(xhr.responseText);}catch(_){data=null;}
				resolve({ok:xhr.status>=200&&xhr.status<300,data:data});
			};
			xhr.onerror=function(){reject(new Error('network'));};
			xhr.send();
		});
	}

	function isExecutableStep(step){
		if(!step)return true;
		if(step.executable===false)return false;
		var t=step.tool||'';
		if(t==='micro_section'||t==='plan_outline')return false;
		return true;
	}

	function finishAssistantCard(data){
		var summary=data.body||data.title||'';
		if(data.action_result&&data.action_result.post_id){
			summary+=' [post_id='+data.action_result.post_id+', title="'+(data.action_result.title||'')+'"]';
		}
		history.push({role:'assistant',content:summary,card:data,ts:Math.floor(Date.now()/1000)});
		autoSave();
	}

	function showVoiceToast(msg){
		var t=document.createElement('div');
		t.className='neo-pulse-voice-toast';
		t.textContent=msg;
		msgs.appendChild(t);
		setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},4500);
	}

	async function deliverMessage(text){
		if(!text||loading)return;
		input.value='';
		if(window.NeoPulseVoice&&typeof window.NeoPulseVoice.updateSendMicVisibility==='function'){
			NeoPulseVoice.updateSendMicVisibility(input,btn);
		}
		appendUser(text);
		history.push({role:'user',content:text,ts:Math.floor(Date.now()/1000)});
		if(assistMode==='chat'){
			runFlowChat(text);
			return;
		}
		loading=true;btn.disabled=true;
		try{
			await runBackendAssist(text);
		}finally{
			loading=false;btn.disabled=false;input.focus();
		}
	}

	function send(){
		var text=input.value.trim();
		if(!text||loading)return;
		deliverMessage(text);
	}

	function runFlowChat(text){
		loading=true;btn.disabled=true;
		var host=fbaThinkingHost();
		var thinkingShell=window.NeoPulseThinkingCard?NeoPulseThinkingCard.createThinkingCard(host,{stream:true}):null;
		var histSlice=history.slice(-10);
		var url=chatAjaxUrl+'?action=neo_pulse_chat_stream&_nonce='+encodeURIComponent(chatStreamNonce||'');
		fetch(url,{
			method:'POST',
			headers:{'Content-Type':'application/json'},
			body:JSON.stringify({message:text,history:histSlice})
		}).then(function(res){
			if(!res.ok)throw new Error('HTTP '+res.status);
			var reader=res.body.getReader();
			var decoder=new TextDecoder();
			var buf='';
			var gotDone=false;
			function handleLine(line){
						line=line.trim();if(!line)return;
						var evt;try{evt=JSON.parse(line);}catch(_){return;}
						if(evt.status==='done'&&evt.card){
							gotDone=true;
							presentCard(evt.card,{
								shell:thinkingShell,
								finish:function(){finishAssistantCard(evt.card);}
							}).then(function(){
								loading=false;btn.disabled=false;input.focus();
							});
						}else if(evt.label&&thinkingShell&&window.NeoPulseThinkingCard){
							NeoPulseThinkingCard.advanceStreamLabel(thinkingShell,host,evt.label);
						}
			}
			function pump(){
				return reader.read().then(function(result){
					if(result.done){
						// Last line may have no trailing newline; a stream with no "done" is an error.
						buf+=decoder.decode();
						if(buf.trim())handleLine(buf);
						buf='';
						if(!gotDone){var endErr=new Error('Stream ended without a reply');endErr.incomplete=true;throw endErr;}
						return;
					}
					buf+=decoder.decode(result.value,{stream:true});
					var lines=buf.split('\n');
					buf=lines.pop();
					lines.forEach(handleLine);
					return pump();
				});
			}
			return pump();
		}).catch(function(err){
			var errBody=err&&err.incomplete?'The reply was interrupted before it finished. Please try again.':'Could not reach the server.';
			presentCard({type:'error',title:err&&err.incomplete?'Something went wrong':'Connection error',body:errBody,confidence:'low'},{
				shell:thinkingShell,
				finish:function(){}
			}).then(function(){
				loading=false;btn.disabled=false;input.focus();
			});
		});
	}

	// â”€â”€ Backend assist (plan-first + chained steps) â”€â”€
	async function runBackendAssist(text){
		var host=fbaThinkingHost();
		var thinkingShell=window.NeoPulseThinkingCard?NeoPulseThinkingCard.createThinkingCard(host,{}):null;
		var histSlice=history.slice(-10);

		try{
			var planRes=await postJson(baseUrl,{message:text,history:histSlice,mode:'plan'});
			var plan=planRes.data;

			if(!planRes.ok||!plan){
				var errCard={
					type:'error',
					title:'Error',
					body:(plan&&plan.error)||'Something went wrong.',
					confidence:'low'
				};
				await presentCard(errCard,{shell:thinkingShell});
				return;
			}

			if(!plan.workflow){
				if(thinkingShell&&window.NeoPulseThinkingCard){
					NeoPulseThinkingCard.setStep(thinkingShell,host,0,'done');
					NeoPulseThinkingCard.setStep(thinkingShell,host,1,'done');
				}
				await presentCard(plan,{shell:thinkingShell});
				return;
			}

			var wfShell=thinkingShell;
			if(!wfShell){
				wfShell=appendWorkflowCard({type:'workflow',title:'Planningâ€¦',body:'Breaking down your requestâ€¦',steps:[]});
				setWorkflowCardActive(wfShell,true);
			}
			updateWorkflowCard(wfShell,plan);

			var wfId=plan.workflow_id;
			var stepCount=(plan.steps&&plan.steps.length)||0;

			for(var i=0;i<stepCount;i++){
				var stepMeta=plan.steps&&plan.steps[i]?plan.steps[i]:null;
				if(stepMeta&&!isExecutableStep(stepMeta)){
					if(stepMeta.status&&isWorkflowStepVisible(stepMeta)){setWorkflowStepStatus(wfShell,i,stepMeta.status);}
					continue;
				}

				var pollTimer=null;
				if(stepMeta&&stepMeta.tool==='write_sections_batch'){
					pollTimer=setInterval(function(){
						getJson(workflowStatusBase+'/'+encodeURIComponent(wfId)+'/status').then(function(res){
							if(res.ok&&res.data&&res.data.steps){updateWorkflowStepsFromPoll(wfShell,res.data.steps);}
						}).catch(function(){});
					},600);
				}

				if(isWorkflowStepVisible(stepMeta)){setWorkflowStepStatus(wfShell,i,'running');}
				var stepRes=await postJson(stepUrl,{workflow_id:wfId,step_index:i,message:text,history:histSlice});
				if(pollTimer){clearInterval(pollTimer);}

				var stepData=stepRes.data;
				if(!stepRes.ok||!stepData){
					if(isWorkflowStepVisible(stepMeta)){setWorkflowStepStatus(wfShell,i,'error');}
					await presentCard({
						type:'workflow',
						title:'Step failed',
						body:(stepData&&stepData.error)||'Could not run step.',
						workflow_complete:true,
						steps:plan.steps,
						confidence:'low'
					},{shell:wfShell});
					break;
				}
				if(stepData.skipped){
					if(plan.steps&&plan.steps[i]){plan.steps[i].status=stepData.status||'done';}
					if(isWorkflowStepVisible(stepMeta)){setWorkflowStepStatus(wfShell,i,stepData.status||'done');}
					continue;
				}
				if(isWorkflowStepVisible(stepMeta)){setWorkflowStepStatus(wfShell,i,stepData.status||'done');}
				if(plan.steps&&plan.steps[i]){plan.steps[i].status=stepData.status||'done';}

				if(stepData.workflow_complete&&stepData.card){
					await presentCard(stepData.card,{shell:wfShell});
					break;
				}
				if(stepData.status==='error'&&stepData.card){
					await presentCard(stepData.card,{shell:wfShell});
					break;
				}
			}
		}catch(_){
			await presentCard({
				type:'error',
				title:'Connection error',
				body:'Could not reach the server.',
				confidence:'low'
			},{shell:thinkingShell});
		}
	}

	// â”€â”€ Session management â”€â”€
	function autoSave(){
		if(history.length===0)return;
		var payload={id:currentSessionId,messages:history};
		var xhr=new XMLHttpRequest();
		xhr.open('POST',sessionsUrl,true);
		xhr.setRequestHeader('Content-Type','application/json');
		xhr.setRequestHeader('X-WP-Nonce',nonce);
		xhr.onload=function(){
			var data;try{data=JSON.parse(xhr.responseText);}catch(_){data=null;}
			if(data&&data.id){
				currentSessionId=data.id;
				loadSessionList();
			}
		};
		xhr.send(JSON.stringify(payload));
	}

	function loadSessionList(){
		var xhr=new XMLHttpRequest();
		xhr.open('GET',sessionsUrl,true);
		xhr.setRequestHeader('X-WP-Nonce',nonce);
		xhr.onload=function(){
			var data;try{data=JSON.parse(xhr.responseText);}catch(_){data=null;}
			renderSidebar(Array.isArray(data)?data:[]);
		};
		xhr.send();
	}

	function renderSidebar(sessions){
		if(!sidebarList)return;
		sidebarList.innerHTML='';
		if(sessions.length===0){
			sidebarList.innerHTML='<div class="fba-sidebar-empty">No saved sessions</div>';
			return;
		}
		sessions.forEach(function(s){
			var item=document.createElement('button');
			item.type='button';
			item.className='fba-sidebar-item'+(s.id===currentSessionId?' fba-sidebar-item--active':'');
			var titleSpan=document.createElement('span');
			titleSpan.className='fba-sidebar-item-title';
			titleSpan.textContent=s.title||'Untitled';
			var meta=document.createElement('span');
			meta.className='fba-sidebar-item-meta';
			var d=s.updated||s.created||'';
			meta.textContent=(d?formatDate(d)+' Â· ':'')+s.message_count+' msgs';
			item.appendChild(titleSpan);
			item.appendChild(meta);
			item.addEventListener('click',function(){loadSession(s.id);});
			sidebarList.appendChild(item);
		});
	}

	function loadSession(id){
		var xhr=new XMLHttpRequest();
		xhr.open('GET',sessionsUrl+'/'+encodeURIComponent(id),true);
		xhr.setRequestHeader('X-WP-Nonce',nonce);
		xhr.onload=function(){
			var data;try{data=JSON.parse(xhr.responseText);}catch(_){data=null;}
			if(!data||!data.messages)return;
			currentSessionId=data.id;
			history=data.messages;
			msgs.innerHTML='';
			data.messages.forEach(function(m){
				if(m.role==='user'){appendUser(m.content||'');}
				else if(m.card){appendCard(m.card);}
				else{appendCard({type:'answer',title:'Response',body:m.content||''});}
			});
			loadSessionList();
		};
		xhr.send();
	}

	function startNewChat(){
		currentSessionId='';
		history=[];
		msgs.innerHTML='';
		if(center)center.style.display='';
		loadSessionList();
		input.focus();
	}

	function clearMemory(){
		if(!confirm('Delete all saved chat sessions? This cannot be undone.'))return;
		var xhr=new XMLHttpRequest();
		xhr.open('DELETE',sessionsUrl,true);
		xhr.setRequestHeader('X-WP-Nonce',nonce);
		xhr.onload=function(){
			currentSessionId='';
			history=[];
			msgs.innerHTML='';
			loadSessionList();
		};
		xhr.send();
	}

	// â”€â”€ UI helpers â”€â”€
	function appendUser(text){
		var d=document.createElement('div');d.className='fba-user';
		d.textContent=text;msgs.appendChild(d);scrollDown();
	}

	function workflowStepIcon(status){
		if(status==='done')return 'âœ“';
		if(status==='running')return '';
		if(status==='error')return 'âœ—';
		return 'â—‹';
	}

	function isWorkflowStepVisible(step){
		if(!step)return true;
		if(step.visible===false)return false;
		if(step.step_kind==='internal')return false;
		return true;
	}

	function applyWorkflowStepIcon(iconEl,status){
		if(!iconEl)return;
		iconEl.className='fba-workflow-step-icon';
		if(status==='running'&&FBA_BRAIN_SVG){
			iconEl.classList.add('fba-workflow-step-icon--thinking');
			iconEl.innerHTML=FBA_BRAIN_SVG;
		}else{
			iconEl.textContent=workflowStepIcon(status);
		}
	}

	function setWorkflowCardActive(shell,active){
		if(!shell||!shell.root)return;
		if(active){shell.root.classList.add('fba-card--workflow-active');}
		else{shell.root.classList.remove('fba-card--workflow-active');}
	}

	function workflowStepKind(step){
		if(step.step_kind){return step.step_kind;}
		if(step.tool==='plan_outline'){return 'plan';}
		if(step.tool==='micro_section'){return 'micro';}
		return '';
	}

	function buildWorkflowStepsList(steps){
		var ul=document.createElement('ul');ul.className='fba-workflow-steps';
		(steps||[]).forEach(function(step,idx){
			if(!isWorkflowStepVisible(step)){return;}
			var li=document.createElement('li');
			var st=step.status||'pending';
			var kind=workflowStepKind(step);
			li.className='fba-workflow-step fba-workflow-step--'+st+(kind?' fba-workflow-step--'+kind:'');
			li.setAttribute('data-step-index',String(idx));
			if(kind){li.setAttribute('data-step-kind',kind);}
			var icon=document.createElement('span');
			applyWorkflowStepIcon(icon,st);
			var label=document.createElement('span');label.className='fba-workflow-step-label';label.textContent=step.label||'Step '+(idx+1);
			li.appendChild(icon);li.appendChild(label);ul.appendChild(li);
		});
		return ul;
	}

	function updateWorkflowStepsFromPoll(shell,steps){
		if(!shell||!shell.stepsList||!steps||!steps.length){return;}
		steps.forEach(function(step,idx){
			if(!isWorkflowStepVisible(step)){return;}
			setWorkflowStepStatus(shell,idx,step.status||'pending');
		});
	}

	function appendWorkflowCard(card){
		var shell=buildCardShell(card,true);
		msgs.appendChild(shell.root);scrollDown();
		return shell;
	}

	function updateWorkflowCard(shell,card){
		if(!shell||!shell.root)return;
		if(shell.titleEl)shell.titleEl.innerHTML=renderMd(card.title||'');
		if(shell.bodyEl){
			if(card.body){shell.bodyEl.innerHTML=renderMd(card.body);shell.bodyEl.style.display='';}
			else{shell.bodyEl.style.display='none';}
		}
		if(card.steps&&shell.stepsList){
			var fresh=buildWorkflowStepsList(card.steps);
			shell.stepsList.parentNode.replaceChild(fresh,shell.stepsList);
			shell.stepsList=fresh;
		}
		if(shell.badgeEl){
			var t=card.type||'workflow';
			shell.badgeEl.className='fba-card-badge'+(t==='action'?' fba-card-badge--action':t==='error'?' fba-card-badge--error':t==='prompt'?' fba-card-badge--prompt':t==='workflow'?' fba-card-badge--workflow':'');
			shell.badgeEl.textContent=t==='prompt'?'info':t;
		}
		populateCardLinksAndActions(shell.root,card,shell);
		scrollDown();
	}

	function setWorkflowStepStatus(shell,idx,status){
		if(!shell||!shell.stepsList)return;
		var li=shell.stepsList.querySelector('[data-step-index="'+idx+'"]');
		if(!li)return;
		var kind=li.getAttribute('data-step-kind')||'';
		li.className='fba-workflow-step fba-workflow-step--'+status+(kind?' fba-workflow-step--'+kind:'');
		var icon=li.querySelector('.fba-workflow-step-icon');
		applyWorkflowStepIcon(icon,status);
	}

	function buildCardShell(card,withSteps){
		var c=document.createElement('div');c.className='fba-card';
		var hdr=document.createElement('div');hdr.className='fba-card-header';
		var badge=document.createElement('span');
		var t=card.type||'answer';
		badge.className='fba-card-badge'+(t==='action'?' fba-card-badge--action':t==='error'?' fba-card-badge--error':t==='prompt'?' fba-card-badge--prompt':t==='workflow'?' fba-card-badge--workflow':'');
		badge.textContent=t==='prompt'?'info':t;
		var titleEl=document.createElement('span');titleEl.className='fba-card-title';titleEl.innerHTML=renderMd(card.title||'');
		hdr.appendChild(badge);hdr.appendChild(titleEl);c.appendChild(hdr);
		var bodyEl=document.createElement('div');bodyEl.className='fba-card-body';
		if(card.body){bodyEl.innerHTML=renderMd(card.body);}else{bodyEl.style.display='none';}
		c.appendChild(bodyEl);
		var stepsList=null;
		if(withSteps||card.steps){
			stepsList=buildWorkflowStepsList(card.steps||[]);
			c.appendChild(stepsList);
		}
		populateCardLinksAndActions(c,card,null);
		return {root:c,badgeEl:badge,titleEl:titleEl,bodyEl:bodyEl,stepsList:stepsList};
	}

	function populateCardLinksAndActions(c,card,shell){
		var oldLinks=c.querySelectorAll('.fba-card-links,.fba-card-actions');
		for(var i=0;i<oldLinks.length;i++){removeEl(oldLinks[i]);}
		var links=card.links&&card.links.length?card.links.slice():[];
		if(card.undo&&card.undo.post_id){
			links.push({label:card.undo.label||'Undo',icon:'edit',action:'undo',post_id:card.undo.post_id,url:'#'});
		}
		if(links.length){
			var lw=document.createElement('div');lw.className='fba-card-links';
			links.forEach(function(link){
				if(link.action==='undo'&&link.post_id){
					if(!undoUrl)return;
					var ua=document.createElement('a');
					ua.className='fba-pill';
					ua.href='#';
					ua.textContent=link.label||'Undo';
					ua.addEventListener('click',function(e){
						e.preventDefault();
						runCardUndo(link.post_id,card,shell,c,ua);
					});
					lw.appendChild(ua);
					return;
				}
				if(!link.url||link.url==='#')return;
				var a=document.createElement('a');a.className='fba-pill';a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=link.label;lw.appendChild(a);
			});
			if(lw.childNodes.length){c.appendChild(lw);}
		}
		if(card.cta&&card.cta.url){
			var lw2=document.createElement('div');lw2.className='fba-card-links';
			var ca=document.createElement('a');ca.className='fba-pill';ca.href=card.cta.url;ca.target='_blank';ca.rel='noopener noreferrer';ca.textContent=card.cta.label||'Open';
			lw2.appendChild(ca);c.appendChild(lw2);
		}
		var actions=card.suggested_actions||card.relatedTopics||[];
		if(actions.length){
			var aw=document.createElement('div');aw.className='fba-card-actions';
			actions.forEach(function(action){
				var chip=document.createElement('button');chip.type='button';chip.className='fba-action-chip';chip.textContent=action;
				chip.addEventListener('click',function(){input.value=action;send();});
				aw.appendChild(chip);
			});c.appendChild(aw);
		}
	}

	async function runCardUndo(postId,card,shell,cardRoot,undoEl){
		if(loading||!postId||!undoUrl)return;
		if(undoEl){undoEl.setAttribute('aria-disabled','true');}
		try{
			var res=await postJson(undoUrl,{post_id:postId});
			if(!res.ok||!res.data){
				if(undoEl){undoEl.removeAttribute('aria-disabled');}
				return;
			}
			var updated=res.data;
			if(shell&&shell.titleEl){shell.titleEl.innerHTML=renderMd(updated.title||'');}
			if(shell&&shell.bodyEl){
				if(updated.body){shell.bodyEl.innerHTML=renderMd(updated.body);shell.bodyEl.style.display='';}
				else{shell.bodyEl.style.display='none';}
			}
			if(shell&&shell.badgeEl){fbaApplyCardBadge(shell.badgeEl,updated.type||'action');}
			populateCardLinksAndActions(cardRoot,updated,shell);
			finishAssistantCard(updated);
		}catch(_){
			if(undoEl){undoEl.removeAttribute('aria-disabled');}
		}
	}

	function appendCard(card){
		var shell=buildCardShell(card,!!(card.steps&&card.steps.length));
		msgs.appendChild(shell.root);scrollDown();
	}

	function appendLoader(){var d=document.createElement('div');d.className='fba-loader';d.innerHTML='<span></span><span></span><span></span>';msgs.appendChild(d);scrollDown();return d;}
	function removeEl(el){if(el&&el.parentNode)el.parentNode.removeChild(el);}
	function scrollDown(){msgs.scrollTop=msgs.scrollHeight;}
	function renderMd(text){
		if(window.NeoPulseMarkdown&&typeof window.NeoPulseMarkdown.render==='function'){return NeoPulseMarkdown.render(text);}
		// Escape quotes too: captured URLs land inside href="...".
		var s=String(text==null?'':text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
		s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
		s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
		s=s.replace(/`([^`]+)`/g,'<code style="background:rgba(255,255,255,.06);padding:1px 5px;border-radius:4px;font-size:1rem">$1</code>');
		s=s.replace(/\n/g,'<br>');return s;
	}
	function formatDate(iso){
		try{var d=new Date(iso);var now=new Date();if(d.toDateString()===now.toDateString())return 'Today';var diff=Math.floor((now-d)/(1000*60*60*24));if(diff===1)return 'Yesterday';if(diff<7)return diff+'d ago';return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});}catch(_){return '';}
	}
})();
