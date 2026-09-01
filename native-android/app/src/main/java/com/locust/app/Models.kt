package com.locust.app

import android.content.Context
import androidx.room3.*
import kotlinx.coroutines.flow.Flow
import java.util.UUID

@Entity(tableName="stories")
data class Story(@PrimaryKey val id:String=UUID.randomUUID().toString(),val title:String="",val description:String="",val category:String="Fanfiction",val createdAt:Long=System.currentTimeMillis(),val updatedAt:Long=System.currentTimeMillis(),val deletedAt:Long?=null)
@Entity(tableName="chapters")
data class Chapter(@PrimaryKey val id:String=UUID.randomUUID().toString(),val storyId:String,val title:String="Chapter 1",val body:String="",val position:Int=0,val updatedAt:Long=System.currentTimeMillis())
@Entity(tableName="profile")
data class Profile(@PrimaryKey val id:Int=1,val name:String="",val handle:String="",val about:String="",val author:String="")
@Dao interface StoryDao{@Query("SELECT * FROM stories WHERE deletedAt IS NULL ORDER BY updatedAt DESC") fun all():Flow<List<Story>>;@Query("SELECT * FROM stories WHERE id=:id") suspend fun one(id:String):Story?;@Upsert suspend fun put(x:Story);@Query("UPDATE stories SET deletedAt=:t,updatedAt=:t WHERE id=:id") suspend fun trash(id:String,t:Long)}
@Dao interface ChapterDao{@Query("SELECT * FROM chapters WHERE storyId=:id ORDER BY position") fun all(id:String):Flow<List<Chapter>>;@Query("SELECT * FROM chapters WHERE id=:id") suspend fun one(id:String):Chapter?;@Upsert suspend fun put(x:Chapter)}
@Dao interface ProfileDao{@Query("SELECT * FROM profile WHERE id=1") fun one():Flow<Profile?>;@Upsert suspend fun put(x:Profile)}
@Database(entities=[Story::class,Chapter::class,Profile::class],version=1,exportSchema=true)
abstract class LocustDb:RoomDatabase(){abstract fun stories():StoryDao;abstract fun chapters():ChapterDao;abstract fun profile():ProfileDao
companion object{fun open(c:Context)=Room.databaseBuilder<LocustDb>(c,"locust.db").build()}}
