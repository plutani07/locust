package com.locust.app

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class LocustVm(app:Application):AndroidViewModel(app){private val db=LocustDb.open(app);val stories=db.stories().all().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());val profile=db.profile().one().stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),null);fun chapters(id:String)=db.chapters().all(id).stateIn(viewModelScope,SharingStarted.WhileSubscribed(5000),emptyList());fun newStory(done:(String)->Unit){viewModelScope.launch{val s=Story();db.stories().put(s);db.chapters().put(Chapter(storyId=s.id));done(s.id)}};fun save(s:Story)=viewModelScope.launch{db.stories().put(s.copy(updatedAt=System.currentTimeMillis()))};fun save(c:Chapter)=viewModelScope.launch{db.chapters().put(c.copy(updatedAt=System.currentTimeMillis()))};fun save(p:Profile)=viewModelScope.launch{db.profile().put(p)};suspend fun story(id:String)=db.stories().one(id);suspend fun chapter(id:String)=db.chapters().one(id);fun trash(id:String)=viewModelScope.launch{db.stories().trash(id,System.currentTimeMillis())}}
